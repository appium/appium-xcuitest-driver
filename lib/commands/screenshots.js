import { retryInterval } from 'asyncbox';
import _ from 'lodash';
import { getScreenshot } from 'node-simctl';
import { exec } from 'teen_process';
import log from '../logger';
import { fs, tempDir } from 'appium-support';

let commands = {};

async function getScreenshotWithIdevicelib (udid) {
  const pathToScreenshotTiff = await tempDir.path({prefix: `screenshot-${udid}`, suffix: '.tiff'});
  await fs.rimraf(pathToScreenshotTiff);
  const pathToResultPng = await tempDir.path({prefix: `screenshot-${udid}`, suffix: '.png'});
  await fs.rimraf(pathToResultPng);
  try {
    try {
      await exec('idevicescreenshot', ['-u', udid, pathToScreenshotTiff]);
    } catch (e) {
      log.warn(`Cannot take a screenshot from the device ${udid} using idevicescreenshot. Original error: ${e.message}`);
      return;
    }
    try {
      // The sips tool is only present on Mac OS
      await exec('sips', ['-s', 'format', 'png', pathToScreenshotTiff, '--out', pathToResultPng]);
    } catch (e) {
      log.warn(`Cannot convert a screenshot from TIFF to PNG using sips tool. Original error: ${e.message}`);
      return;
    }
    if (!await fs.exists(pathToResultPng)) {
      log.warn(`Cannot convert a screenshot from TIFF to PNG. The conversion result does not exist at ${pathToResultPng}`);
      return;
    }
    return (await fs.readFile(pathToResultPng)).toString('base64');
  } finally {
    await fs.rimraf(pathToScreenshotTiff);
    await fs.rimraf(pathToResultPng);
  }
}

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
    if (this.isRealDevice() && await fs.which('idevicescreenshot')) {
      log.info(`Falling back to 'idevicescreenshot' API`);
      const data = await getScreenshotWithIdevicelib(this.opts.udid);
      if (data) {
        return data;
      }
    }
    // Retry for real devices only. Fail fast on Simulator if simctl does not work as expected
    let result;
    await retryInterval(5, 1000, async () => {
      result = await getScreenshotFromWDA();
    });
    return result;
  }
};

export default commands;
