import {retryInterval} from 'asyncbox';
import _ from 'lodash';
import {errors} from 'appium/driver';
import {util, imageUtil} from 'appium/support';
import type {XCUITestDriver} from '../driver';
import type {Simulator} from 'appium-ios-simulator';
import type {Element} from '@appium/types';

/**
 * Takes a screenshot of the current screen.
 *
 * @returns Base64-encoded screenshot data
 */
export async function getScreenshot(this: XCUITestDriver): Promise<string> {
  if (this.isWebContext()) {
    const webScreenshotMode = (await this.settings.getSettings()).webScreenshotMode;
    switch (_.toLower(webScreenshotMode)) {
      case 'page':
      case 'viewport':
        return await this.remote.captureScreenshot({
          coordinateSystem: _.capitalize(webScreenshotMode) as 'Viewport' | 'Page',
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

  const getScreenshotFromWDA = async (): Promise<string> => {
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
  } catch (err: any) {
    this.log.warn(`Error getting screenshot: ${err.message}`);
  }

  // simulator attempt
  if (this.isSimulator()) {
    this.log.info(`Falling back to 'simctl io screenshot' API`);
    const payload = await (this.device as Simulator).simctl.getScreenshot();
    if (!payload) {
      throw new errors.UnableToCaptureScreen();
    }
    return payload;
  }

  // Retry for real devices only. Fail fast on Simulator if simctl does not work as expected
  return await retryInterval(2, 1000, getScreenshotFromWDA) as string;
}

/**
 * Takes a screenshot of a specific element.
 *
 * @param el - Element to capture
 * @returns Base64-encoded screenshot data
 */
export async function getElementScreenshot(
  this: XCUITestDriver,
  el: Element<string> | string,
): Promise<string> {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.getAtomsElement(el);
    const {width, height} = await this.executeAtom('get_size', [atomsElement]);
    if (!width || !height) {
      throw new errors.UnableToCaptureScreen('Cannot take a screenshot of a zero-size element');
    }
    const {x, y} = await this.executeAtom('get_top_left_coordinates', [atomsElement]);
    return await this.remote.captureScreenshot({rect: {x, y, width, height}});
  }

  const data = await this.proxyCommand(`/element/${el}/screenshot`, 'GET');
  if (!_.isString(data)) {
    throw new errors.UnableToCaptureScreen(
      `Unable to take an element screenshot. WDA returned: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

/**
 * Takes a screenshot of the current viewport.
 *
 * @returns Base64-encoded screenshot data
 */
export async function getViewportScreenshot(this: XCUITestDriver): Promise<string> {
  if (this.isWebContext()) {
    return await this.remote.captureScreenshot();
  }

  const screenshot = await this.getScreenshot();
  // if we don't have a status bar, there's nothing to crop, so we can avoid
  // extra calls and return straight away
  if ((await this.getStatusBarHeight()) === 0) {
    return screenshot;
  }

  const sharp = imageUtil.requireSharp();
  const {width, height} = await sharp(Buffer.from(screenshot, 'base64')).metadata();
  if (!width || !height) {
    throw new errors.UnableToCaptureScreen('The device screenshot is empty');
  }
  this.log.debug(`Screenshot dimensions: ${width}x${height}`);
  const region = await this.getViewportRect();
  if (region.width + region.left > width) {
    this.log.info('Viewport region exceeds screenshot width, adjusting region to fit');
    region.width = width - region.left;
  }
  if (region.height + region.top > height) {
    this.log.info('Viewport region exceeds screenshot height, adjusting region to fit');
    region.height = height - region.top;
  }
  this.log.debug(`Calculated viewport rect: ${JSON.stringify(region)}`);
  return await imageUtil.cropBase64Image(screenshot, region);
}

