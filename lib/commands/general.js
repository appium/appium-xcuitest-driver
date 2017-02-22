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
  return await this.proxyCommand('/wda/deactivateApp', 'POST', params);
};

/*
 * Simulate Touch ID with either valid (match === true) or invalid (match === false)
 * fingerprint
 */
commands.touchId = async function (match = true) {
  let params = {
    match
  };
  return await this.proxyCommand('/wda/touch_id', 'POST', params);
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
  await this.proxyCommand('/wda/keyboard/dismiss', 'POST');
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

export { commands };
export default commands;
