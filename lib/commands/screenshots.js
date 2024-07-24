import {retryInterval} from 'asyncbox';
import _ from 'lodash';
import {errors} from 'appium/driver';
import {util, imageUtil} from 'appium/support';

export default {
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<string>}
   */
  async getScreenshot() {
    if (this.isWebContext()) {
      const webScreenshotMode = (await this.settings.getSettings()).webScreenshotMode;
      switch (_.toLower(webScreenshotMode)) {
        case 'page':
        case 'viewport':
          return await (/** @type {import('appium-remote-debugger').RemoteDebugger} */ (this.remote)).captureScreenshot({
            coordinateSystem: /** @type {'Viewport'|'Page'} */ (_.capitalize(webScreenshotMode)),
          });
        case 'native':
        case undefined:
        case null:
          break;
        default:
          this.log.warn(
            `The webScreenshotMode setting value '${webScreenshotMode}' is not known. ` +
            `Supported values are: page, viewport and native. Falling back to the native mode.`
          );
          break;
      }
    }

    const getScreenshotFromWDA = async () => {
      this.log.debug(`Taking screenshot with WDA`);
      const data = await this.proxyCommand('/screenshot', 'GET');
      if (!_.isString(data)) {
        throw new Error(`Unable to take screenshot. WDA returned '${JSON.stringify(data)}'`);
      }
      return data;
    };

    // if we've specified an mjpeg server, use that
    if (this.mjpegStream) {
      this.log.info(`mjpeg video stream provided, returning latest frame as screenshot`);
      const data = await this.mjpegStream.lastChunkPNGBase64();
      if (data) {
        return data;
      }
      this.log.warn(
        'Tried to get screenshot from active MJPEG stream, but there ' +
          'was no data yet. Falling back to regular screenshot methods.',
      );
    }

    try {
      return await getScreenshotFromWDA();
    } catch (err) {
      this.log.warn(`Error getting screenshot: ${err.message}`);
    }

    // simulator attempt
    if (this.isSimulator()) {
      this.log.info(`Falling back to 'simctl io screenshot' API`);
      const payload = await /** @type {import('../driver').Simulator} */ (this.device).simctl.getScreenshot();
      if (!payload) {
        throw new errors.UnableToCaptureScreen();
      }
      return payload;
    }

    // Retry for real devices only. Fail fast on Simulator if simctl does not work as expected
    return /** @type {string} */ (await retryInterval(2, 1000, getScreenshotFromWDA));
  },
  /**
   * @this {XCUITestDriver}
   */
  async getElementScreenshot(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      return await this.executeAtom('getElementScreenshot', [atomsElement]);
    }

    const data = await this.proxyCommand(`/element/${el}/screenshot`, 'GET');
    if (!_.isString(data)) {
      this.log.errorAndThrow(
        `Unable to take a screenshot of the element ${el}. WDA returned '${JSON.stringify(data)}'`,
      );
    }
    return data;
  },
  /**
   * @this {XCUITestDriver}
   */
  async getViewportScreenshot() {
    if (this.isWebContext()) {
      return await (/** @type {import('appium-remote-debugger').RemoteDebugger} */ (this.remote)).captureScreenshot();
    }

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
      height: windowSize.height * scale - statusBarHeight,
    };
    let newScreenshot = await imageUtil.cropBase64Image(screenshot, rect);
    return newScreenshot;
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
