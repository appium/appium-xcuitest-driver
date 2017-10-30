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
      log.warn(`Cannot take a screenshot from the device '${udid}' using ` +
               `idevicescreenshot. Original error: ${e.message}`);
      return;
    }
    try {
      // The sips tool is only present on Mac OS
      await exec('sips', ['-s', 'format', 'png', pathToScreenshotTiff, '--out', pathToResultPng]);
    } catch (e) {
      log.warn(`Cannot convert a screenshot from TIFF to PNG using sips tool. ` +
               `Original error: ${e.message}`);
      return;
    }
    if (!await fs.exists(pathToResultPng)) {
      log.warn(`Cannot convert a screenshot from TIFF to PNG. The conversion ` +
               `result does not exist at '${pathToResultPng}'`);
      return;
    }
    return (await fs.readFile(pathToResultPng)).toString('base64');
  } finally {
    await fs.rimraf(pathToScreenshotTiff);
    await fs.rimraf(pathToResultPng);
  }
}

async function isIdevicescreenshotAvailable () {
  return !!(await fs.which('idevicescreenshot'));
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
    if (this.isRealDevice() && await isIdevicescreenshotAvailable()) {
      log.debug(`Taking screenshot with 'idevicescreenshot'`);
      return await getScreenshotWithIdevicelib(this.opts.udid);
    } else {
      log.debug(`Taking screenshot with WDA`);
      return await getScreenshotFromWDA();
    }
  } catch (err) {
    log.debug(`Error getting screenshot: ${err.message}`);

    if (!this.isRealDevice()) {
      if (this.xcodeVersion.versionFloat < 8.1) {
        log.errorAndThrow(`No command line screenshot ability with Xcode ` +
                 `${this.xcodeVersion.versionFloat}. Please upgrade to ` +
                 `at least Xcode 8.1`);
      }
      log.info(`Falling back to 'simctl io screenshot' API`);
      return await getScreenshot(this.opts.udid);
    } else {
      if (await isIdevicescreenshotAvailable()) {
        log.info(`Falling back to 'idevicescreenshot' API`);
        const data = await getScreenshotWithIdevicelib(this.opts.udid);
        if (data) {
          return data;
        }
      } else {
        log.info(`No 'idevicescreenshot' program found. To use, install ` +
                 `using 'brew install libimobiledevice'`);
      }
    }

    // Retry for real devices only. Fail fast on Simulator if simctl does not work as expected
    log.debug('Retrying screenshot through WDA');
    return await retryInterval(5, 1000, getScreenshotFromWDA);
  }
};

export default commands;
