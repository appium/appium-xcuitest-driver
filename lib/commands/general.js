import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { iosCommands } from 'appium-ios-driver';
import log from '../logger';
import { util } from 'appium-support';
import moment from 'moment';
import { utilities } from 'appium-ios-device';

let commands = {}, helpers = {}, extensions = {};

const MOMENT_FORMAT_ISO8601 = 'YYYY-MM-DDTHH:mm:ssZ';

commands.active = async function active () {
  if (this.isWebContext()) {
    return await this.executeAtom('active_element', []);
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
  if (this.isRealDevice()) {
    const { timestamp, utcOffset } = await utilities.getDeviceTime(this.opts.udid);
    return moment.unix(timestamp).utcOffset(utcOffset).format(format);
  } else {
    return await iosCommands.general.getDeviceTime.call(this, format);
  }
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
  if (!(this.opts.deviceName || '').includes('iPhone')) {
    // TODO: once WDA can handle dismissing keyboard for iphone, take away conditional
    try {
      await this.proxyCommand('/wda/keyboard/dismiss', 'POST');
      return;
    } catch (ign) {}
  }

  log.debug('Cannot dismiss the keyboard using the native call. Trying to apply a workaround...');

  let keyboard;
  try {
    keyboard = await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
  } catch (err) {
    // no keyboard found
    log.debug('No keyboard found. Unable to hide.');
    return;
  }
  possibleKeys.pop(); // last parameter is the session id
  possibleKeys = possibleKeys.filter((element) => !!element); // get rid of undefined elements
  if (possibleKeys.length) {
    for (const key of possibleKeys) {
      let el = _.last(await this.findNativeElementOrElements('accessibility id', key, true, keyboard));
      if (el) {
        log.debug(`Attempting to hide keyboard by pressing '${key}' key.`);
        await this.nativeClick(el);
        return;
      }
    }
  } else {
    // find the keyboard, and hit the last Button
    log.debug('Finding keyboard and clicking final button to close');
    if (await this.getNativeAttribute('visible', keyboard) === 'false') {
      log.debug('No visible keyboard found. Returning');
      return;
    }
    let buttons = await this.findNativeElementOrElements('class name', 'XCUIElementTypeButton', true, keyboard);
    if (_.isEmpty(buttons)) {
      log.warn(`No button elements found. Unable to hide.`);
      return;
    }
    await this.nativeClick(_.last(buttons));
  }
};

commands.getStrings = iosCommands.general.getStrings;

commands.removeApp = async function removeApp (bundleId) {
  return await this.mobileRemoveApp({bundleId});
};

commands.launchApp = iosCommands.general.launchApp;

commands.closeApp = iosCommands.general.closeApp;

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
  if (!this.isWebContext() && this.isRealDevice()) {
    return await this.proxyCommand('/url', 'POST', {url});
  }
  return await iosCommands.general.setUrl.call(this, url);
};

commands.getViewportRect = iosCommands.device.getViewportRect;

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

commands.mobilePressButton = async function mobilePressButton (opts = {}) {
  const {name} = opts;
  if (!name) {
    log.errorAndThrow('Button name is mandatory');
  }
  return await this.proxyCommand('/wda/pressButton', 'POST', {name});
};

commands.mobileSiriCommand = async function mobileSiriCommand (opts = {}) {
  const {text} = opts;
  if (!util.hasValue(text)) {
    log.errorAndThrow('"text" argument is mandatory');
  }
  return await this.proxyCommand('/wda/siri/activate', 'POST', {text});
};

Object.assign(extensions, commands, helpers);

export { commands, helpers, extensions };
export default extensions;
