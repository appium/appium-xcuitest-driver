import B from 'bluebird';

let commands = {};

commands.lock = async function (seconds) {
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

commands.unlock = async function () {
  await this.proxyCommand('/wda/unlock', 'POST');
};

commands.isLocked = async function () {
  return await this.proxyCommand('/wda/locked', 'GET');
};

export { commands };
export default commands;
