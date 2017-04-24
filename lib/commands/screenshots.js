import { retryInterval } from 'asyncbox';
import _ from 'lodash';
import { getScreenshot } from 'node-simctl';
import log from '../logger';

let commands = {};

commands.getScreenshot = async function () {
  const getScreenshotFromWDA = async () => {
    const data = await this.proxyCommand('/screenshot', 'GET');
    if (!_.isString(data)) {
      throw new Error(`Unable to take screenshot. WDA returned '${JSON.stringify(data)}'`);
    }
    return data;
  };
  try {
    return await getScreenshotFromWDA();
  } catch (err) {
    if (!this.isRealDevice() && this.xcodeVersion.versionFloat >= 8.1) {
      log.info(`Falling back to 'simctl io screenshot' API`);
      return await getScreenshot(this.opts.udid);
    }
    // Retry for real devices only. Fail fast on Simulator if simctl does not work as expected
    let result;
    await retryInterval(9, 1000, async () => {
      result = await getScreenshotFromWDA();
    });
    return result;
  }
};

export default commands;
