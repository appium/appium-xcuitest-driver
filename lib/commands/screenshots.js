import { retryInterval } from 'asyncbox';
import _ from 'lodash';


let commands = {};

commands.getScreenshot = async function () {
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
