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

export { commands };
export default commands;
