import { errors } from 'appium-base-driver';
// import _ from 'lodash';


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

// commands.keys = async function (keys) {
//   if (this.isWebContext()) {
//     let el = await this.active();
//     if (_.isUndefined(el.ELEMENT)) {
//       throw new errors.NoSuchElementError();
//     }
//     await this.setValue(keys, el);
//   } else {
//     if (_.isArray(keys)) {
//       keys = keys.join('');
//     }
//     if (!_.isString(keys)) {
//       keys = keys.toString();
//     }
//     keys = util.escapeSpecialChars(keys, "'");
//     let command = `au.sendKeysToActiveElement('${keys}')`;
//     await this.uiAutoClient.sendCommand(command);
//   }
// };

export { commands };
export default commands;
