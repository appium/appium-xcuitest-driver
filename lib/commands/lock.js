import B from 'bluebird';

let commands = {};

commands.lock = async function lock (seconds) {
  await this.proxyCommand('/wda/lock', 'POST');
  if (isNaN(seconds)) {
    return;
  }

  const floatSeconds = parseFloat(seconds);
  if (floatSeconds <= 0) {
    return;
  }

  await B.delay(floatSeconds * 1000);
  await this.proxyCommand('/wda/unlock', 'POST');
};

commands.unlock = async function unlock () {
  await this.proxyCommand('/wda/unlock', 'POST');
};

commands.isLocked = async function isLocked () {
  return await this.proxyCommand('/wda/locked', 'GET');
};

export { commands };
export default commands;
