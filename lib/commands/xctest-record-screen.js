import _ from 'lodash';
import {fs, util} from 'appium/support';
import {encodeBase64OrUpload} from '../utils';
import path from 'node:path';
import {Devicectl} from '../devicectl';

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
 * @typedef {XcTestScreenRecordingInfo} XcTestScreenRecording
 * @property {string} payload Base64-encoded content of the recorded media
 * file if `remotePath` parameter is empty or null or an empty string.
 */

/**
 * @this {XCUITestDriver}
 * @param {string} uuid Unique identifier of the video being recorded
 * @returns {Promise<string>} The full path to the screen recording movie
 */
async function retrieveRecodingFromSimulator(uuid) {
  // @ts-ignore The property is there
  const device = this.opts.device;
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
  const devicectl = new Devicectl(this.opts.udid, this.log);
  const fileNames = await devicectl.listFiles(DOMAIN_TYPE, DOMAIN_IDENTIFIER, {
    username: USERNAME,
    subdirectory: SUBDIRECTORY,
  });
  if (!fileNames.includes(uuid)) {
    throw new Error(
      `Unable to locate XCTest screen recording identified by '${uuid}' for the device ${this.opts.udid}`
    );
  }
  const videoPath = path.join(/** @type {string} */ (this.opts.tmpDir), `${uuid}${MOV_EXT}`);
  await devicectl.pullFile(`${SUBDIRECTORY}/${uuid}`, videoPath, {
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
   * Direct Appium to start recording the device screen
   *
   * Record the display of devices running iOS Simulator since Xcode 9 or real devices since iOS 11
   * (ffmpeg utility is required: 'brew install ffmpeg').
   * It records screen activity to a MPEG-4 file. Audio is not recorded with the video file.
   * If screen recording has been already started then the command will stop it forcefully and start a new one.
   * The previously recorded video file will be deleted.
   *
   * @param {number} [fps] FPS value
   * @param {number} [codec] Video codec, where 0 is h264
   * @returns {Promise<XcTestScreenRecordingInfo>}
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
   *
   * @returns {Promise<XcTestScreenRecordingInfo?>}
   */
  async mobileGetXctestScreenRecordingInfo() {
    return /** @type {XcTestScreenRecordingInfo?} */ (
      await this.proxyCommand('/wda/video', 'GET')
    );
  },

  /**
   * Direct Appium to stop screen recording and return the video
   *
   * If no screen recording process is running then the endpoint will try to get
   * the recently recorded file. If no previously recorded file is found and no
   * active screen recording processes are running then the method returns an
   * empty string.
   *
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
    try {
      screenRecordingInfo.payload = await encodeBase64OrUpload(videoPath, remotePath, {
        user, pass, headers, fileFieldName, formFields, method
      });
    } finally {
      await fs.rimraf(videoPath);
    }
    return screenRecordingInfo;
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
