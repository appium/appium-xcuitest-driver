import { errors } from 'appium-base-driver';


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
    throw new errors.UnknownCommandError('This method should be proxied to WDA');
  }
  return await this.executeAtom('get_window_size', []);
};

export { commands };
export default commands;
