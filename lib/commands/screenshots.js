import { retryInterval } from 'asyncbox';
import _ from 'lodash';
import { getScreenshot } from 'node-simctl';
import log from '../logger';

let commands = {};

commands.getScreenshot = async function () {
  try {
    if (!this.isRealDevice() && this.xcodeVersion.versionFloat >= 8.1) {
      return await getScreenshot(this.opts.udid);
    }
  } catch (err) {
    log.warn(`Cannot make a screenshot using simctl because of "${err.message}". Falling back to WDA API`);
  }
  let data;
  await retryInterval(10, 1000, async () => {
    data = await this.proxyCommand('/screenshot', 'GET');
    if (!_.isString(data)) {
      throw new Error(`Unable to take screenshot. WDA returned '${JSON.stringify(data)}'`);
    }
  });
  return data;
};

export default commands;
