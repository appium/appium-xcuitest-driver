import _ from 'lodash';
import {fs, util} from 'appium/support';
import {encodeBase64OrUpload} from '../utils';
import path from 'node:path';

const MOV_EXT = '.mov';
const FEATURE_NAME = 'xctest_screen_record';
const DOMAIN_IDENTIFIER = 'com.apple.testmanagerd';
const DOMAIN_TYPE = 'appDataContainer';
const USERNAME = 'mobile';
const SUBDIRECTORY = 'Attachments';

/**
 * @typedef {Object} XcTestScreenRecordingInfo
 * @property {string} uuid Unique identifier of the video being recorded
 * @property {number} fps FPS value
 * @property {number} codec Video codec, where 0 is h264
 * @property {number} startedAt The timestamp when the screen recording has started in float Unix seconds
 */

/**
 * @typedef {Object} XcTestScreenRecordingType
 * @property {string} payload Base64-encoded content of the recorded media
 * file if `remotePath` parameter is empty or null or an empty string otherwise.
 * The media is expected to a be a valid QuickTime movie (.mov).
 * @typedef {XcTestScreenRecordingInfo & XcTestScreenRecordingType} XcTestScreenRecording
 */

/**
 * @this {XCUITestDriver}
 * @param {string} uuid Unique identifier of the video being recorded
 * @returns {Promise<string>} The full path to the screen recording movie
 */
async function retrieveRecodingFromSimulator(uuid) {
  const device = /** @type {import('../driver').Simulator} */ (this.device);
  const dataRoot = /** @type {string} */ (device.getDir());
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

/**
 * @this {XCUITestDriver}
 * @param {string} uuid Unique identifier of the video being recorded
 * @returns {Promise<string>} The full path to the screen recording movie
 */
async function retrieveRecodingFromRealDevice(uuid) {
  const device = /** @type {import('../real-device').RealDevice} */ (this.device);

  const fileNames = await device.devicectl.listFiles(DOMAIN_TYPE, DOMAIN_IDENTIFIER, {
    username: USERNAME,
    subdirectory: SUBDIRECTORY,
  });
  if (!fileNames.includes(uuid)) {
    throw new Error(
      `Unable to locate XCTest screen recording identified by '${uuid}' for the device ${this.opts.udid}`
    );
  }
  const videoPath = path.join(/** @type {string} */ (this.opts.tmpDir), `${uuid}${MOV_EXT}`);
  await device.devicectl.pullFile(`${SUBDIRECTORY}/${uuid}`, videoPath, {
    username: USERNAME,
    domainIdentifier: DOMAIN_IDENTIFIER,
    domainType: DOMAIN_TYPE,
  });
  const {size} = await fs.stat(videoPath);
  this.log.debug(`Pulled the video to '${videoPath}' (${util.toReadableSizeString(size)})`);
  return videoPath;
}

/**
 * @this {XCUITestDriver}
 * @param {string} uuid Unique identifier of the video being recorded
 * @returns {Promise<string>} The full path to the screen recording movie
 */
async function retrieveXcTestScreenRecording(uuid) {
  return this.isRealDevice()
    ? await retrieveRecodingFromRealDevice.bind(this)(uuid)
    : await retrieveRecodingFromSimulator.bind(this)(uuid);
}

export default {
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
   * @param {number} [fps] FPS value
   * @param {number} [codec] Video codec, where 0 is h264, 1 is HEVC
   * @returns {Promise<XcTestScreenRecordingInfo>} The information
   * about a newly created or a running the screen recording.
   * @throws {Error} If screen recording has failed to start.
   * @this {XCUITestDriver}
   */
  async mobileStartXctestScreenRecording(fps, codec) {
    if (this.isRealDevice()) {
      // This feature might be used to abuse real devices as there is no
      // reliable way (yet) to cleanup video recordings stored there
      // by the testmanagerd daemon
      this.assertFeatureEnabled(FEATURE_NAME);
    }

    const opts = {};
    if (_.isInteger(codec)) {
      opts.codec = codec;
    }
    if (_.isInteger(fps)) {
      opts.fps = fps;
    }
    const response = /** @type {XcTestScreenRecordingInfo} */ (
      await this.proxyCommand('/wda/video/start', 'POST', opts)
    );
    this.log.info(`Started a new screen recording: ${JSON.stringify(response)}`);
    return response;
  },

  /**
   * Retrieves information about the current running screen recording.
   * If no screen recording is running then `null` is returned.
   *
   * @returns {Promise<XcTestScreenRecordingInfo?>}
   */
  async mobileGetXctestScreenRecordingInfo() {
    return /** @type {XcTestScreenRecordingInfo?} */ (
      await this.proxyCommand('/wda/video', 'GET')
    );
  },

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
   * shut down XCTest by calling `POST /wda/shutdown` API or by doing factory reset.
   *
   * @since Xcode 15/iOS 17
   * @param {string} [remotePath] The path to the remote location, where the resulting video should be
   * uploaded.
   * The following protocols are supported: `http`, `https`, `ftp`. Null or empty
   * string value (the default setting) means the content of resulting file
   * should be encoded as Base64 and passed as the endpoint response value. An
   * exception will be thrown if the generated media file is too big to fit into
   * the available process memory.
   * @param {string} [user] The name of the user for the remote authentication.
   * Only works if `remotePath` is provided.
   * @param {string} [pass] The password for the remote authentication.
   * Only works if `remotePath` is provided.
   * @param {import('@appium/types').HTTPHeaders} [headers] Additional headers mapping for multipart http(s) uploads
   * @param {string} [fileFieldName] The name of the form field where the file content BLOB should be stored for
   * http(s) uploads
   * @param {Record<string, any> | [string, any][]} [formFields] Additional form fields for multipart http(s) uploads
   * @param {'PUT' | 'POST' | 'PATCH'} [method='PUT'] The http multipart upload method name.
   * Only works if `remotePath` is provided.
   * @returns {Promise<XcTestScreenRecording>}
   * @throws {Error} If there was an error while retrieving the video
   * file or the file content cannot be uploaded to the remote location.
   * @this {XCUITestDriver}
   */
  async mobileStopXctestScreenRecording(remotePath, user, pass, headers, fileFieldName, formFields, method) {
    const screenRecordingInfo = await this.mobileGetXctestScreenRecordingInfo();
    if (!screenRecordingInfo) {
      throw new Error('There is no active screen recording. Did you start one beforehand?');
    }

    this.log.debug(`Stopping the active screen recording: ${JSON.stringify(screenRecordingInfo)}`);
    await this.proxyCommand('/wda/video/stop', 'POST', {});
    const videoPath = await retrieveXcTestScreenRecording.bind(this)(screenRecordingInfo.uuid);
    const result = /** @type {XcTestScreenRecording} */ (screenRecordingInfo);
    try {
      result.payload = await encodeBase64OrUpload(videoPath, remotePath, {
        user, pass, headers, fileFieldName, formFields, method
      });
    } finally {
      await fs.rimraf(videoPath);
    }
    return result;
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
