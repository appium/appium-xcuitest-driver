import { retryInterval } from 'asyncbox';
import _ from 'lodash';
import { getScreenshot } from 'node-simctl';
import log from '../logger';

let commands = {};

commands.getScreenshot = async function () {
  let data;
  if (this.xcodeVersion.versionFloat >= 8.1) {
    data = await getScreenshot(this.opts.udid);
  } else {
    log.info(`Using legacy WDA screenshot for xcode version < 8.2`);
    await retryInterval(10, 1000, async () => {
      data = await this.proxyCommand('/screenshot', 'GET');
      if (!_.isString(data)) {
        throw new Error(`Unable to take screenshot. WDA returned '${JSON.stringify(data)}'`);
      }
    });
  }

  return data;
};

export default commands;
