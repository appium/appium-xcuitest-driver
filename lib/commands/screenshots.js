import { retryInterval } from 'asyncbox';
import _ from 'lodash';
import { getScreenshot } from 'node-simctl';
import { exec } from 'teen_process';
import log from '../logger';
import { fs, tempDir, util, imageUtil } from 'appium-support';

let commands = {};

async function getScreenshotWithIdevicelib (udid, isLandscape) {
  const pathToScreenshotTiff = await tempDir.path({prefix: `screenshot-${udid}`, suffix: '.tiff'});
  await fs.rimraf(pathToScreenshotTiff);
  const pathToResultPng = await tempDir.path({prefix: `screenshot-${udid}`, suffix: '.png'});
  await fs.rimraf(pathToResultPng);
  try {
    try {
      await exec('idevicescreenshot', ['-u', udid, pathToScreenshotTiff]);
    } catch (e) {
      throw new Error(`Cannot take a screenshot from the device '${udid}' using ` +
        `idevicescreenshot. Original error: ${e.message}`);
    }
    let sipsArgs = ['-s', 'format', 'png', pathToScreenshotTiff, '--out', pathToResultPng];
    if (isLandscape) {
      sipsArgs = ['-r', '-90', ...sipsArgs];
    }
    try {
      // The sips tool is only present on Mac OS
      await exec('sips', sipsArgs);
    } catch (e) {
      throw new Error(`Cannot convert a screenshot from TIFF to PNG using sips tool. ` +
        `Original error: ${e.message}`);
    }
    if (!await fs.exists(pathToResultPng)) {
      throw new Error(`Cannot convert a screenshot from TIFF to PNG. The conversion ` +
        `result does not exist at '${pathToResultPng}'`);
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
    log.debug(`Taking screenshot with WDA`);
    return await getScreenshotFromWDA();
  } catch (err) {
    log.warn(`Error getting screenshot: ${err.message}`);

    if (this.isSimulator()) {
      if (this.xcodeVersion.versionFloat < 8.1) {
        log.errorAndThrow(`No command line screenshot ability with Xcode ` +
                 `${this.xcodeVersion.versionFloat}. Please upgrade to ` +
                 `at least Xcode 8.1`);
      }
      log.info(`Falling back to 'simctl io screenshot' API`);
      return await getScreenshot(this.opts.udid);
    }
  }

  // all simulator scenarios are finished
  // real device, so try idevicescreenshot if possible
  try {
    if (await isIdevicescreenshotAvailable()) {
      log.debug(`Taking screenshot with 'idevicescreenshot'`);
      const orientation = await this.proxyCommand('/orientation', 'GET');
      return await getScreenshotWithIdevicelib(this.opts.udid, orientation === 'LANDSCAPE');
    }
    log.info(`No 'idevicescreenshot' program found. To use, install ` +
             `using 'brew install --HEAD libimobiledevice'`);
  } catch (err) {
    log.warn(`Error getting screenshot through 'idevicescreenshot': ${err.message}`);
  }

  // Retry for real devices only. Fail fast on Simulator if simctl does not work as expected
  log.debug('Retrying screenshot through WDA');
  return await retryInterval(2, 1000, getScreenshotFromWDA);
};

commands.getElementScreenshot = async function (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.useAtomsElement(el);
    return await this.executeAtom('getElementScreenshot', [atomsElement]);
  }

  if (this.xcodeVersion.major < 9) {
    log.errorAndThrow(`Element screenshots are only available since Xcode 9. ` +
                      `The current Xcode version is ${this.xcodeVersion.major}.${this.xcodeVersion.minor}`);
  }
  const data = await this.proxyCommand(`/element/${el}/screenshot`, 'GET');
  if (!_.isString(data)) {
    log.errorAndThrow(`Unable to take a screenshot of the element ${el}. WDA returned '${JSON.stringify(data)}'`);
  }
  return data;
};

commands.getViewportScreenshot = async function () {
  let statusBarHeight = await this.getStatusBarHeight();
  const screenshot = await this.getScreenshot();

  // if we don't have a status bar, there's nothing to crop, so we can avoid
  // extra calls and return straightaway
  if (statusBarHeight === 0) {
    return screenshot;
  }

  const scale = await this.getDevicePixelRatio();
  // status bar height comes in unscaled, so scale it
  statusBarHeight = Math.round(statusBarHeight * scale);
  const windowSize = await this.getWindowSize();
  let rect = {
    left: 0,
    top: statusBarHeight,
    width: windowSize.width * scale,
    height: ((windowSize.height * scale) - statusBarHeight)
  };
  let newScreenshot = await imageUtil.cropBase64Image(screenshot, rect);
  return newScreenshot;
};

export default commands;
