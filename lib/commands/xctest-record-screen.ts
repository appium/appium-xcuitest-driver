import _ from 'lodash';
import {fs, util} from 'appium/support';
import {encodeBase64OrUpload} from '../utils';
import path from 'node:path';
import type {XCUITestDriver} from '../driver';
import type {Simulator} from 'appium-ios-simulator';
import type {RealDevice} from '../device/real-device-management';
import type {HTTPHeaders} from '@appium/types';
import type {XcTestScreenRecordingInfo, XcTestScreenRecording} from './types';

const MOV_EXT = '.mov';
const FEATURE_NAME = 'xctest_screen_record';
const DOMAIN_IDENTIFIER = 'com.apple.testmanagerd';
const DOMAIN_TYPE = 'appDataContainer';
const USERNAME = 'mobile';
const SUBDIRECTORY = 'Attachments';

async function retrieveRecodingFromSimulator(this: XCUITestDriver, uuid: string): Promise<string> {
  const device = this.device as Simulator;
  const dataRoot = device.getDir();
  // On Simulators the path looks like
  // $HOME/Library/Developer/CoreSimulator/Devices/F8E1968A-8443-4A9A-AB86-27C54C36A2F6/data/Containers/Data/InternalDaemon/4E3FE8DF-AD0A-41DA-B6EC-C35E5798C219/Attachments/A044DAF7-4A58-4CD5-95C3-29B4FE80C377
  const internalDaemonRoot = path.resolve(dataRoot, 'Containers', 'Data', 'InternalDaemon');
  const videoPaths = await fs.glob(`*/Attachments/${uuid}`, {
    cwd: internalDaemonRoot,
    absolute: true,
  });
  if (_.isEmpty(videoPaths)) {
    throw new Error(
      `Unable to locate XCTest screen recording identified by '${uuid}' for the Simulator ${device.udid}`
    );
  }
  const videoPath = videoPaths[0];
  const {size} = await fs.stat(videoPath);
  this.log.debug(`Located the video at '${videoPath}' (${util.toReadableSizeString(size)})`);
  return videoPath;
}

async function retrieveRecodingFromRealDevice(this: XCUITestDriver, uuid: string): Promise<string> {
  const device = this.device as RealDevice;

  const fileNames = await device.devicectl.listFiles(DOMAIN_TYPE, DOMAIN_IDENTIFIER, {
    username: USERNAME,
    subdirectory: SUBDIRECTORY,
  });
  if (!fileNames.includes(uuid)) {
    throw new Error(
      `Unable to locate XCTest screen recording identified by '${uuid}' for the device ${this.opts.udid}`
    );
  }
  if (!this.opts.tmpDir) {
    throw new Error('tmpDir is not set in driver options');
  }
  const videoPath = path.join(this.opts.tmpDir, `${uuid}${MOV_EXT}`);
  await device.devicectl.pullFile(`${SUBDIRECTORY}/${uuid}`, videoPath, {
    username: USERNAME,
    domainIdentifier: DOMAIN_IDENTIFIER,
    domainType: DOMAIN_TYPE,
  });
  const {size} = await fs.stat(videoPath);
  this.log.debug(`Pulled the video to '${videoPath}' (${util.toReadableSizeString(size)})`);
  return videoPath;
}

async function retrieveXcTestScreenRecording(this: XCUITestDriver, uuid: string): Promise<string> {
  return this.isRealDevice()
    ? await retrieveRecodingFromRealDevice.call(this, uuid)
    : await retrieveRecodingFromSimulator.call(this, uuid);
}

/**
 * Start a new screen recording via XCTest.
 *
 * Even though the feature is available for real devices
 * there is no possibility to delete stored video files yet,
 * which may lead to internal storage overload.
 * That is why it was put under a security feature flag.
 *
 * If the recording is already running this API is a noop.
 *
 * @since Xcode 15/iOS 17
 * @param fps - FPS value
 * @param codec - Video codec, where 0 is h264, 1 is HEVC
 * @returns The information about a newly created or a running the screen recording.
 * @throws {Error} If screen recording has failed to start.
 */
export async function mobileStartXctestScreenRecording(
  this: XCUITestDriver,
  fps?: number,
  codec?: number,
): Promise<XcTestScreenRecordingInfo> {
  if (this.isRealDevice()) {
    // This feature might be used to abuse real devices as there is no
    // reliable way (yet) to cleanup video recordings stored there
    // by the testmanagerd daemon
    this.assertFeatureEnabled(FEATURE_NAME);
  }

  const opts: {codec?: number; fps?: number} = {};
  if (_.isInteger(codec)) {
    opts.codec = codec;
  }
  if (_.isInteger(fps)) {
    opts.fps = fps;
  }
  const response = await this.proxyCommand('/wda/video/start', 'POST', opts) as XcTestScreenRecordingInfo;
  this.log.info(`Started a new screen recording: ${JSON.stringify(response)}`);
  return response;
}

/**
 * Retrieves information about the current running screen recording.
 * If no screen recording is running then `null` is returned.
 */
export async function mobileGetXctestScreenRecordingInfo(
  this: XCUITestDriver,
): Promise<XcTestScreenRecordingInfo | null> {
  return (await this.proxyCommand('/wda/video', 'GET')) as XcTestScreenRecordingInfo | null;
}

/**
 * Stop screen recording previously started by mobileStartXctestScreenRecording API.
 *
 * An error is thrown if no screen recording is running.
 *
 * The resulting movie is returned as base-64 string or is uploaded to
 * a remote location if corresponding options have been provided.
 *
 * The resulting movie is automatically deleted FOR SIMULATORS ONLY.
 * In order to clean it up from a real device it is necessary to properly
 * shut down XCTest by calling `GET /wda/shutdown` API to the WebDriverAgent server running
 * on the device directly or by doing factory reset.
 *
 * @since Xcode 15/iOS 17
 * @param remotePath - The path to the remote location, where the resulting video should be
 * uploaded.
 * The following protocols are supported: `http`, `https`, `ftp`. Null or empty
 * string value (the default setting) means the content of resulting file
 * should be encoded as Base64 and passed as the endpoint response value. An
 * exception will be thrown if the generated media file is too big to fit into
 * the available process memory.
 * @param user - The name of the user for the remote authentication.
 * Only works if `remotePath` is provided.
 * @param pass - The password for the remote authentication.
 * Only works if `remotePath` is provided.
 * @param headers - Additional headers mapping for multipart http(s) uploads
 * @param fileFieldName - The name of the form field where the file content BLOB should be stored for
 * http(s) uploads
 * @param formFields - Additional form fields for multipart http(s) uploads
 * @param method - The http multipart upload method name.
 * Only works if `remotePath` is provided.
 * @returns The resulting movie with base64-encoded content or empty string if uploaded remotely.
 * @throws {Error} If there was an error while retrieving the video
 * file or the file content cannot be uploaded to the remote location.
 */
export async function mobileStopXctestScreenRecording(
  this: XCUITestDriver,
  remotePath?: string,
  user?: string,
  pass?: string,
  headers?: HTTPHeaders,
  fileFieldName?: string,
  formFields?: Record<string, any> | [string, any][],
  method: 'PUT' | 'POST' | 'PATCH' = 'PUT',
): Promise<XcTestScreenRecording> {
  const screenRecordingInfo = await this.mobileGetXctestScreenRecordingInfo();
  if (!screenRecordingInfo) {
    throw new Error('There is no active screen recording. Did you start one beforehand?');
  }

  this.log.debug(`Stopping the active screen recording: ${JSON.stringify(screenRecordingInfo)}`);
  await this.proxyCommand('/wda/video/stop', 'POST', {});
  const videoPath = await retrieveXcTestScreenRecording.call(this, screenRecordingInfo.uuid);
  const result: XcTestScreenRecording = {
    ...screenRecordingInfo,
    payload: '', // Will be set below
  };
  try {
    result.payload = await encodeBase64OrUpload(videoPath, remotePath, {
      user, pass, headers, fileFieldName, formFields, method
    });
  } finally {
    await fs.rimraf(videoPath);
  }
  return result;
}

