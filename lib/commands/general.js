import _ from 'lodash';
import { errors } from 'appium-base-driver';
import log from '../logger';
import { util } from 'appium-support';
import moment from 'moment-timezone';
import { utilities } from 'appium-ios-device';
import { exec } from 'teen_process';
import { parseLocalizableStrings } from '../app-utils';

let commands = {}, helpers = {}, extensions = {};

const MOMENT_FORMAT_ISO8601 = 'YYYY-MM-DDTHH:mm:ssZ';


commands.active = async function active () {
  if (this.isWebContext()) {
    return this.cacheWebElements(await this.executeAtom('active_element', []));
  }
  return await this.proxyCommand(`/element/active`, 'GET');
};

/**
 * Close app (simulate device home button). It is possible to restore
 * the app after the timeout or keep it minimized based on the parameter value.
 *
 * @param {?number|Object} seconds
 * - any positive number of seconds: come back after X seconds
 * - any negative number of seconds or zero: never come back
 * - undefined/null: never come back
 * - {timeout: 5000}: come back after 5 seconds
 * - {timeout: null}, {timeout: -2}: never come back
 */
commands.background = async function background (seconds) {
  const homescreen = '/wda/homescreen';
  const deactivateApp = '/wda/deactivateApp';

  let endpoint;
  let params = {};
  const selectEndpoint = (timeoutSeconds) => {
    if (!util.hasValue(timeoutSeconds)) {
      endpoint = homescreen;
    } else if (!isNaN(timeoutSeconds)) {
      const duration = parseFloat(timeoutSeconds);
      if (duration >= 0) {
        params = {duration};
        endpoint = deactivateApp;
      } else {
        endpoint = homescreen;
      }
    }
  };
  if (_.has(seconds, 'timeout')) {
    const {timeout} = seconds;
    selectEndpoint(isNaN(timeout) ? timeout : parseFloat(timeout) / 1000.0);
  } else {
    selectEndpoint(seconds);
  }
  if (!endpoint) {
    log.errorAndThrow(`Argument value is expected to be a valid number. ` +
      `${JSON.stringify(seconds)} has been provided instead`);
  }
  return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreen);
};

commands.touchId = async function touchId (match = true) {
  await this.mobileSendBiometricMatch({match});
};

commands.toggleEnrollTouchId = async function toggleEnrollTouchId (isEnabled = true) {
  await this.mobileEnrollBiometric({isEnabled});
};

helpers.getWindowSizeWeb = async function getWindowSizeWeb () {
  return await this.executeAtom('get_window_size', []);
};

helpers.getWindowSizeNative = async function getWindowSizeNative () {
  return await this.proxyCommand(`/window/size`, 'GET');
};

commands.getWindowSize = async function getWindowSize (windowHandle = 'current') {
  if (windowHandle !== 'current') {
    throw new errors.NotYetImplementedError('Currently only getting current window size is supported.');
  }

  if (!this.isWebContext()) {
    return await this.getWindowSizeNative();
  } else {
    return await this.getWindowSizeWeb();
  }
};

/**
 * Retrieves the current device's timestamp.
 *
 * @param {string} format - The set of format specifiers. Read
 *                          https://momentjs.com/docs/ to get the full list of supported
 *                          datetime format specifiers. The default format is
 *                          `YYYY-MM-DDTHH:mm:ssZ`, which complies to ISO-8601
 * @returns Formatted datetime string or the raw command output if formatting fails
 */
commands.getDeviceTime = async function getDeviceTime (format = MOMENT_FORMAT_ISO8601) {
  log.info('Attempting to capture iOS device date and time');
  if (!this.isRealDevice()) {
    log.info('On simulator. Assuming device time is the same as host time');
    const cmd = 'date';
    const args = ['+%Y-%m-%dT%H:%M:%S%z'];
    const inputFormat = 'YYYY-MM-DDTHH:mm:ssZZ';
    const stdout = (await exec(cmd, args)).stdout.trim();
    log.debug(`Got the following output out of '${cmd} ${args.join(' ')}': ${stdout}`);
    const parsedTimestamp = moment.utc(stdout, inputFormat);
    if (!parsedTimestamp.isValid()) {
      log.warn(`Cannot parse the timestamp '${stdout}' returned by '${cmd}' command. Returning it as is`);
      return stdout;
    }
    return parsedTimestamp.utcOffset(parsedTimestamp._tzm || 0).format(format);
  }

  const {
    timestamp,
    utcOffset,
    timeZone,
  } = await utilities.getDeviceTime(this.opts.udid);
  log.debug(`timestamp: ${timestamp}, utcOffset: ${utcOffset}, timeZone: ${timeZone}`);
  const utc = moment.unix(timestamp).utc();
  // at some point of time Apple started to return timestamps
  // in utcOffset instead of actual UTC offsets
  if (Math.abs(utcOffset) <= 12 * 60) {
    return utc.utcOffset(utcOffset).format(format);
  }
  // timeZone could either be a time zone name or
  // an UTC offset in seconds
  if (_.includes(timeZone, '/')) {
    return utc.tz(timeZone).format(format);
  }
  if (Math.abs(timeZone) <= 12 * 60 * 60) {
    return utc.utcOffset(timeZone / 60).format(format);
  }
  log.warn('Did not know how to apply the UTC offset. Returning the timestamp without it');
  return utc.format(format);
};

/**
 * @typedef {Object} DeviceTimeOptions
 * @property {string} format [YYYY-MM-DDTHH:mm:ssZ] - See getDeviceTime#format
 */

/**
 * Retrieves the current device time
 *
 * @param {DeviceTimeOptions} opts
 * @return {string} Formatted datetime string or the raw command output if formatting fails
 */
commands.mobileGetDeviceTime = async function mobileGetDeviceTime (opts = {}) {
  return await this.getDeviceTime(opts.format);
};

// For W3C
commands.getWindowRect = async function getWindowRect () {
  const {width, height} = await this.getWindowSize();
  return {
    width,
    height,
    x: 0,
    y: 0
  };
};

commands.hideKeyboard = async function hideKeyboard (strategy, ...possibleKeys) {
  // last parameter is the session id
  const keyNames = _.compact(possibleKeys.slice(0, -1)).map((x) => `${x}`);
  if (!keyNames.includes('done')) {
    keyNames.push('done');
  }
  await this.proxyCommand('/wda/keyboard/dismiss', 'POST', {keyNames});
};

commands.getStrings = async function getStrings (language, stringFile = null) {
  log.debug(`Gettings strings for language '${language}' and string file '${stringFile}'`);
  return await parseLocalizableStrings(Object.assign({}, this.opts, {
    language,
    stringFile,
    strictMode: true,
  }));
};

commands.removeApp = async function removeApp (bundleId) {
  return await this.mobileRemoveApp({bundleId});
};

commands.launchApp = async function launchApp () {
  const appName = this.opts.app || this.opts.bundleId;
  try {
    await this.start();
    log.info(`Successfully launched the '${appName}' app.`);
  } catch (err) {
    log.warn(`Something went wrong while launching the '${appName}' app.`);
    throw err;
  }
};

commands.closeApp = async function closeApp () {
  const appName = this.opts.app || this.opts.bundleId;
  try {
    await this.stop();
    log.info(`Successfully closed the '${appName}' app.`);
  } catch (err) {
    log.warn(`Something went wrong while closing the '${appName}' app.`);
    throw err;
  }
};

commands.keys = async function keys (keys) {
  if (!this.isWebContext()) {
    throw new errors.UnknownError('Command should be proxied to WDA');
  }
  let el = util.unwrapElement(await this.active());
  if (_.isEmpty(el)) {
    throw new errors.NoSuchElementError();
  }
  await this.setValue(keys, el);
};

commands.setUrl = async function setUrl (url) {
  log.debug(`Attempting to set url '${url}'`);

  if (this.isWebContext()) {
    this.setCurrentUrl(url);
    // make sure to clear out any leftover web frames
    this.curWebFrames = [];
    await this.remote.navToUrl(url);
    return;
  }

  if (this.isRealDevice()) {
    await this.proxyCommand('/url', 'POST', {url});
  } else {
    await this.opts.device.simctl.openUrl(url);
  }
};

commands.getViewportRect = async function getViewportRect () {
  const scale = await this.getDevicePixelRatio();
  // status bar height comes in unscaled, so scale it
  const statusBarHeight = Math.round(await this.getStatusBarHeight() * scale);
  const windowSize = await this.getWindowSize();

  // ios returns coordinates/dimensions in logical pixels, not device pixels,
  // so scale up to device pixels. status bar height is already scaled.
  return {
    left: 0,
    top: statusBarHeight,
    width: windowSize.width * scale,
    height: ((windowSize.height * scale) - statusBarHeight),
  };
};

// memoized in constructor
commands.getScreenInfo = async function getScreenInfo () {
  return await this.proxyCommand('/wda/screen', 'GET');
};

commands.getStatusBarHeight = async function getStatusBarHeight () {
  const {statusBarSize} = await this.getScreenInfo();
  return statusBarSize.height;
};

// memoized in constructor
commands.getDevicePixelRatio = async function getDevicePixelRatio () {
  const {scale} = await this.getScreenInfo();
  return scale;
};

/**
 * @typedef {Object} PressButtonOptions
 * @property {string} name - The name of the button to be pressed.
 * @property {?number} durationSeconds - Duration in float seconds.
 */

/**
 * Emulates press the given devive button name.
 *
 * @param {PressButtonOptions} opts
 */
commands.mobilePressButton = async function mobilePressButton (opts = {}) {
  const {name, durationSeconds} = opts;
  if (!name) {
    throw new errors.InvalidArgumentError('Button name is mandatory');
  }
  if (!_.isNil(durationSeconds) && !_.isNumber(durationSeconds)) {
    throw new errors.InvalidArgumentError('durationSeconds should be a number');
  }
  return await this.proxyCommand('/wda/pressButton', 'POST',
    {name, duration: durationSeconds});
};

commands.mobileSiriCommand = async function mobileSiriCommand (opts = {}) {
  const {text} = opts;
  if (!util.hasValue(text)) {
    throw new errors.InvalidArgumentError('"text" argument is mandatory');
  }
  return await this.proxyCommand('/wda/siri/activate', 'POST', {text});
};

Object.assign(extensions, commands, helpers);

export { commands, helpers, extensions };
export default extensions;
