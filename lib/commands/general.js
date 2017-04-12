import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { iosCommands } from 'appium-ios-driver';
import log from '../logger';


let commands = {};

commands.active = async function () {
  if (!this.isWebContext()) {
    throw new errors.UnknownError('Command should be proxied to WDA');
  }
  return await this.executeAtom('active_element', []);
};

/**
 * Close app (simulate device home button). It is possible to restore
 * the app after the timeout or keep it minimized based on the parameter value.
 *
 * Possible values for `duration`:
 * - any positive number of seconds: come back after X seconds, show deprecation warning
 * - any negative number of seconds: never come back, show deprecation warning
 * - undefined: come back after the default timeout (defined by WDA), show deprecation warning. After deprecation: never come back
 * - {timeout: 5000}: come back after 5 seconds
 * - {timeout: null}, {timeout: -2}: never come back
 */
commands.background = async function (duration) {
  const homescreenEndpoint = '/wda/homescreen';
  const deactivateAppEndpoint = '/wda/deactivateApp';
  let endpoint;
  let params;
  if (_.isUndefined(duration)) {
    // TODO: Replace the block after deprecated stuff is removed
    // endpoint = homescreenEndpoint;
    log.warn('commands.background: Application under test will never be restored in the future if no duration is provided. ' +
             'See https://github.com/appium/appium/issues/7741');
    endpoint = deactivateAppEndpoint;
    params = {};
  } else if (_.isNumber(duration)) {
    // TODO: deprecate this case
    log.warn('commands.background: Passing numbers to \'duration\' argument is deprecated. ' +
             'See https://github.com/appium/appium/issues/7741');
    if (duration >= 0) {
      params = {duration};
      endpoint = deactivateAppEndpoint;
    } else {
      endpoint = homescreenEndpoint;
    }
  } else if (_.isPlainObject(duration)) {
    if (_.has(duration, 'timeout')) {
      if (duration.timeout === null) {
        endpoint = homescreenEndpoint;
      } else if (_.isNumber(duration.timeout)) {
        if (duration.timeout >= 0) {
          params = {duration: duration.timeout / 1000.0};
          endpoint = deactivateAppEndpoint;
        } else {
          endpoint = homescreenEndpoint;
        }
      }
    }
  }
  if (_.isUndefined(endpoint)) {
    log.errorAndThrow('commands.background: Argument value is expected to be an object or \'undefined\'. ' +
                      `'${duration}' value has been provided instead. ` +
                      'The \'timeout\' attribute can be \'null\' or any negative number to put the app under test ' +
                      'into background and never come back or a positive number of milliseconds to wait until the app is restored.');
  }
  return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreenEndpoint);
};

/*
 * Simulate Touch ID with either valid (match === true) or invalid (match === false)
 * fingerprint (Simulator only)
 */
commands.touchId = async function (match = true) {
  if (!this.isSimulator()) {
    throw new errors.UnknownError('Touch ID simulation not supported on real devices');
  }

  return await this.proxyCommand('/wda/touch_id', 'POST', {match});
};

/*
 * Toggle enrollment of touchId (Simuulator only)
 */
commands.toggleEnrollTouchId = async function () {
  if (!this.opts.allowTouchIdEnroll) {
    throw new errors.UnknownError(`Must set desired capability 'allowTouchIdEnroll = true' to enroll touchId`);
  }

  if (!this.isSimulator()) {
    throw new errors.UnknownError('Touch ID simulation not supported on real devices');
  } else {
    await this.opts.device.enrollTouchID();
  }
};

commands.getWindowSize = async function (windowHandle = 'current') {
  if (windowHandle !== "current") {
    throw new errors.NotYetImplementedError('Currently only getting current window size is supported.');
  }

  if (!this.isWebContext()) {
    return await this.proxyCommand(`/window/size`, 'GET');
  } else {
    return await this.executeAtom('get_window_size', []);
  }
};

commands.hideKeyboard = async function (strategy, ...possibleKeys) {
  if ((this.opts.deviceName || '').indexOf('iPhone') === -1) {
    // TODO: once WDA can handle dismissing keyboard for iphone, take away conditional
    try {
      await this.proxyCommand('/wda/keyboard/dismiss', 'POST');
      return;
    } catch (err) {
      log.debug('Cannot dismiss the keyboard using the native call. Trying to apply a workaround...');
    }
  }

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
    for (let key of possibleKeys) {
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
    let buttons = await this.findNativeElementOrElements('class name', 'XCUIElementTypeButton', true, keyboard);
    await this.nativeClick(_.last(buttons));
  }
};

commands.getDeviceTime = iosCommands.general.getDeviceTime;

commands.getStrings = iosCommands.general.getStrings;

commands.removeApp = async function (bundleId) {
  if (this.isRealDevice()) {
    await this.opts.device.remove(bundleId);
  } else {
    await this.opts.device.removeApp(bundleId);
  }
};

commands.launchApp = iosCommands.general.launchApp;

commands.closeApp = iosCommands.general.closeApp;

commands.keys = async function (keys) {
  if (!this.isWebContext()) {
    throw new errors.UnknownError('Command should be proxied to WDA');
  }
  let el = await this.active();
  if (_.isUndefined(el.ELEMENT)) {
    throw new errors.NoSuchElementError();
  }
  await this.setValue(keys, el.ELEMENT);
};

commands.setUrl = iosCommands.general.setUrl;

export { commands };
export default commands;
