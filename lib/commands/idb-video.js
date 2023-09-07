import _ from 'lodash';
import { tempDir, fs } from 'appium/support';
import path from 'path';
import {encodeBase64OrUpload} from '../utils';
import {waitForCondition} from 'asyncbox';
import {exec} from 'teen_process';

const commands = {};

/**
 *
 * @param {string} fpath
 * @param {number} [timeoutMs=60000]
 */
async function waitUntilIdbUnlocksFile(fpath, timeoutMs = 60000) {
  await waitForCondition(
    async () => {
      try {
        const {stdout} = await exec('lsof', [fpath]);
        return !_.includes(stdout, 'idb');
      } catch (ign) {
        return true;
      }
    },
    {
      waitMs: timeoutMs,
      intervalMs: 100,
    }
  );
}

/**
 * @this {import('../driver').XCUITestDriver}
 */
commands.startIdbVideoRecording = async function startIdbVideoRecording () {
  if (!_.isPlainObject(this.opts.idbVideo)) {
    throw new TypeError('The idbVideo capability is expected to be a valid object');
  }
  /** @type {import('appium-idb').IDB?} */
  // @ts-ignore This property should exist
  const idb = this.opts.device.idb;
  if (!idb) {
    throw new Error(`IDB must be initialized in order to start the video recording`);
  }

  // no hacks allowed
  delete this.opts.idbVideo.outputFile;

  const {
    fps = 30,
    startupTimeoutMs,
    compressionQuality,
    scaleFactor,
  } = this.opts.idbVideo;

  // Make sure we don't run any obsolete streaming processes
  await idb.stopVideoStream();

  const tmpRoot = await tempDir.openDir();
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
  const outputFile = path.join(tmpRoot, name);
  try {
    await idb.startVideoStream({
      fps,
      format: 'h264',
      timeoutMs: startupTimeoutMs,
      compressionQuality,
      scaleFactor,
      outputFile,
    });
  } catch (e) {
    await fs.rimraf(tmpRoot);
    throw e;
  }
  this.log.info(`Recording the device screen into '${outputFile}'`);
  this.opts.idbVideo.outputFile = outputFile;
};

/**
 * @typedef {Object} StopVideoRecordingOptions
 * @property {string} [remotePath] The path to the remote location, where the resulting video should be
 * uploaded.
 * The following protocols are supported: `http`, `https`, `ftp`. Null or empty
 * string value (the default setting) means the content of resulting file
 * should be encoded as Base64 and passed as the endpoint response value. An
 * exception will be thrown if the generated media file is too big to fit into
 * the available process memory.
 * @property {string} [user] The name of the user for the remote authentication.
 * Only works if `remotePath` is provided.
 * @property {string} [pass] The password for the remote authentication.
 * Only works if `remotePath` is provided.
 * @property {import('@appium/types').HTTPHeaders} [headers] Additional headers
 * mapping for multipart http(s) uploads
 * @property {string} [fileFieldName] The name of the form field where the file
 * content BLOB should be stored for http(s) uploads
 * @property {Record<string, any> | [string, any][]} [formFields] Additional form
 * fields for multipart http(s) uploads
 * @property {'PUT' | 'POST' | 'PATCH'} [method='PUT'] The http multipart upload method name.
 * Only works if `remotePath` is provided.
 */

/**
 * @this {import('../driver').XCUITestDriver}
 * @param {StopVideoRecordingOptions} opts
 * @returns {Promise<string>} Base64-encoded content of the recorded media
 * file if `remotePath` parameter is empty or null or an empty string.
 */
commands.mobileStopIdbVideoRecording = async function mobileStopIdbVideoRecording (opts) {
  const videoPath = this.opts.idbVideo?.outputFile;
  if (!videoPath) {
    this.log.info('The IDB screen recording is not running. There is nothing to stop.');
    return '';
  }

  // @ts-ignore This property should exist
  await this.opts.device.idb.stopVideoStream();
  if (!(await fs.exists(videoPath))) {
    throw new Error(
      `The IDB screen recording has failed to store the actual screen recording at '${videoPath}'`
    );
  }
  await waitUntilIdbUnlocksFile(videoPath);
  return await encodeBase64OrUpload(videoPath, opts.remotePath, opts);
};

/**
 * @this {import('../driver').XCUITestDriver}
 * @returns {Promise<void>}
 */
commands.cleanupIdbVideoRecording = async function cleanupIdbVideoRecording () {
  // @ts-ignore This property should exist
  const idb = this.opts.device?.idb;
  if (!idb) {
    return;
  }
  const videoPath = this.opts.idbVideo?.outputFile;
  if (!videoPath) {
    return;
  }
  await idb.stopVideoStream();
  if (!await fs.exists(videoPath)) {
    return;
  }
  try {
    await waitUntilIdbUnlocksFile(videoPath);
  } catch (ign) {
  } finally {
    await fs.rimraf(videoPath);
  }
};

export default commands;
