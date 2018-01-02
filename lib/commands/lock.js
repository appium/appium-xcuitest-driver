import _ from 'lodash';
import B from 'bluebird';

let commands = {};

commands.lock = async function (seconds = null) {
  await this.proxyCommand('/wda/lock', 'POST');
  if (_.isNumber(seconds) && seconds >= 0) {
    await B.delay(seconds * 1000);
    await this.proxyCommand('/wda/unlock', 'POST');
  }
};

commands.unlock = async function () {
  await this.proxyCommand('/wda/unlock', 'POST');
};

commands.isLocked = async function () {
  return (await this.proxyCommand('/wda/screen', 'GET')).locked;
};

export { commands };
export default commands;
