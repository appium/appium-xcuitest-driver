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
 * Close app (simulate device home button). If a duration is given, app will
 * re-open after that many seconds
 */
commands.background = async function (seconds) {
  let params = {};
  if (seconds) {
    params.duration = seconds;
  }
  return await this.proxyCommand('/deactivateApp', 'POST', params);
};

/*
 * Simulate Touch ID with either valid (match === true) or invalid (match === false)
 * fingerprint
 */
commands.touchId = async function (match = true) {
  let params = {
    match
  };
  return await this.proxyCommand('/simulator/touch_id', 'POST', params);
};

commands.getWindowSize = async function (windowHandle = 'current') {
  if (windowHandle !== "current") {
    throw new errors.NotYetImplementedError('Currently only getting current window size is supported.');
  }

  if (!this.isWebContext()) {
    return await this.proxyCommand(`/window/${windowHandle}/size`, 'GET');
  } else {
    return await this.executeAtom('get_window_size', []);
  }
};

commands.hideKeyboard = async function (strategy, ...possibleKeys) {
  possibleKeys.pop(); // last parameter is the session id
  possibleKeys = possibleKeys.filter((element) => !!element); // get rid of undefined elements
  possibleKeys = possibleKeys && possibleKeys.length ? possibleKeys : ['Done'];
  for (let key of possibleKeys) {
    let el = _.last(await this.findNativeElementOrElements('accessibility id', key, true));
    if (el) {
      log.debug(`Attempting to hide keyboard by pressing '${key}' key.`);
      await this.nativeClick(el);
      return;
    }
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

export { commands };
export default commands;
