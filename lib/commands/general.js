let commands = {};

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

/*
 * Return to home screen (simulates tapping on home button).
 *
 */
commands.homeScreen = async function () {
  let method = 'POST';
  let endpoint = `/homescreen`;
  return await this.proxyCommand(endpoint, method);
};

export { commands };
export default commands;
