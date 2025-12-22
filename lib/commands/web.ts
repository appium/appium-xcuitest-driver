import {errors, isErrorType} from 'appium/driver';
import {timing, util} from 'appium/support';
import {retryInterval} from 'asyncbox';
import B, {TimeoutError, AggregateError} from 'bluebird';
import _ from 'lodash';
import {assertSimulator} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {Element, Cookie, Size, Position, Rect} from '@appium/types';
import type {AtomsElement} from './types';
import type {CalibrationData} from '../types';
import type {RemoteDebugger} from 'appium-remote-debugger';

const IPHONE_TOP_BAR_HEIGHT = 71;
const IPHONE_SCROLLED_TOP_BAR_HEIGHT = 41;
const IPHONE_X_SCROLLED_OFFSET = 55;
const IPHONE_X_NOTCH_OFFSET_IOS = 24;
const IPHONE_X_NOTCH_OFFSET_IOS_13 = 20;

const IPHONE_LANDSCAPE_TOP_BAR_HEIGHT = 51;
const IPHONE_BOTTOM_BAR_OFFSET = 49;
const TAB_BAR_OFFSET = 33;
const IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET = 84;
const IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET = 95;

const CALIBRATION_TAP_DELTA_PX = 7;

const NOTCHED_DEVICE_SIZES = [
  {w: 1125, h: 2436}, // 11 Pro, X, Xs
  {w: 828, h: 1792}, // 11, Xr
  {w: 1242, h: 2688}, // 11 Pro Max, Xs Max
  {w: 1080, h: 2340}, // 13 mini, 12 mini
  {w: 1170, h: 2532}, // 14, 13, 13 Pro, 12, 12 Pro
  {w: 1284, h: 2778}, // 14 Plus, 13 Pro Max, 12 Pro Max
  {w: 1179, h: 2556}, // 14 Pro
  {w: 1290, h: 2796}, // 14 Pro Max
];

const {W3C_WEB_ELEMENT_IDENTIFIER} = util;

const ATOM_WAIT_TIMEOUT_MS = 2 * 60000;
// This value must be greater than the alerts check interval in WDA:
// https://github.com/appium/WebDriverAgent/blob/8bc3135f021b529d916846477544f4b8ca890f59/WebDriverAgentLib/Utilities/FBAlertsMonitor.m#L17
const ATOM_INITIAL_WAIT_MS = 2100;
const OBSTRUCTING_ALERT_PRESENCE_CHECK_INTERVAL_MS = 500;

const ON_OBSTRUCTING_ALERT_EVENT = 'alert';
const ON_APP_CRASH_EVENT = 'app_crash';

const VISIBLE = 'visible';
const INVISIBLE = 'invisible';
const DETECT = 'detect';
const VISIBILITIES = [VISIBLE, INVISIBLE, DETECT] as const;

// The position of Safari's tab (search bar).
// Since iOS 15, the bar is the bottom by default.
const TAB_BAR_POSITION_TOP = 'top';
const TAB_BAR_POSITION_BOTTOM = 'bottom';
const TAB_BAR_POSSITIONS = [TAB_BAR_POSITION_TOP, TAB_BAR_POSITION_BOTTOM] as const;

/**
 * Sets the current web frame context.
 *
 * @param frame - Frame identifier (number, string, or null to return to default content)
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 * @throws {errors.NoSuchFrameError} If the specified frame is not found
 */
export async function setFrame(this: XCUITestDriver, frame: number | string | null): Promise<void> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  if (_.isNull(frame)) {
    this.curWebFrames = [];
    this.log.debug('Leaving web frame and going back to default content');
    return;
  }

  if (hasElementId(frame)) {
    const atomsElement = this.getAtomsElement(frame);
    const value = await this.executeAtom('get_frame_window', [atomsElement]) as {WINDOW: string};
    this.log.debug(`Entering new web frame: '${value.WINDOW}'`);
    this.curWebFrames.unshift(value.WINDOW);
  } else {
    const atom = _.isNumber(frame) ? 'frame_by_index' : 'frame_by_id_or_name';
    const value = await this.executeAtom(atom, [frame]) as {WINDOW?: string} | null;
    if (_.isNull(value) || _.isUndefined(value.WINDOW)) {
      throw new errors.NoSuchFrameError();
    }
    this.log.debug(`Entering new web frame: '${value.WINDOW}'`);
    this.curWebFrames.unshift(value.WINDOW);
  }
}

/**
 * Gets the value of a CSS property for an element.
 *
 * @param propertyName - Name of the CSS property
 * @param el - Element to get the property from
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function getCssProperty(this: XCUITestDriver, propertyName: string, el: Element | string): Promise<string> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const atomsElement = this.getAtomsElement(el);
  return await this.executeAtom('get_value_of_css_property', [atomsElement, propertyName]) as string;
}

/**
 * Submits the form that contains the specified element.
 *
 * @param el - The element ID or element object
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function submit(this: XCUITestDriver, el: string | Element): Promise<void> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const atomsElement = this.getAtomsElement(el);
  await this.executeAtom('submit', [atomsElement]);
}

/**
 * Refreshes the current page.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function refresh(this: XCUITestDriver): Promise<void> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  await (this.remote as RemoteDebugger).execute('window.location.reload()');
}

/**
 * Gets the current page URL.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function getUrl(this: XCUITestDriver): Promise<string> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await (this.remote as RemoteDebugger).execute('window.location.href') as string;
}

/**
 * Gets the current page title.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function title(this: XCUITestDriver): Promise<string> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await (this.remote as RemoteDebugger).execute('window.document.title') as string;
}

/**
 * Gets all cookies for the current page.
 *
 * Cookie values are automatically URI-decoded.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function getCookies(this: XCUITestDriver): Promise<Cookie[]> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  // get the cookies from the remote debugger, or an empty object
  const {cookies} = await (this.remote as RemoteDebugger).getCookies();

  // the value is URI encoded, so decode it safely
  return cookies.map((cookie) => {
    if (!_.isEmpty(cookie.value)) {
      try {
        cookie.value = decodeURI(cookie.value);
      } catch (error: any) {
        this.log.debug(
          `Cookie ${cookie.name} was not decoded successfully. Cookie value: ${cookie.value}`,
        );
        this.log.warn(error);
        // Keep the original value
      }
    }
    return cookie;
  });
}

/**
 * Sets a cookie for the current page.
 *
 * If the cookie's path is not specified, it defaults to '/'.
 *
 * @param cookie - Cookie object to set
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function setCookie(this: XCUITestDriver, cookie: Cookie): Promise<void> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const clonedCookie = _.clone(cookie);
  // if `path` field is not specified, Safari will not update cookies as expected; eg issue #1708
  if (!clonedCookie.path) {
    clonedCookie.path = '/';
  }
  const jsCookie = createJSCookie(clonedCookie.name, clonedCookie.value, {
    expires: _.isNumber(clonedCookie.expiry)
      ? new Date(clonedCookie.expiry * 1000).toUTCString()
      : clonedCookie.expiry,
    path: clonedCookie.path,
    domain: clonedCookie.domain,
    httpOnly: clonedCookie.httpOnly,
    secure: clonedCookie.secure,
  });
  const script = `document.cookie = ${JSON.stringify(jsCookie)}`;
  await this.executeAtom('execute_script', [script, []]);
}

/**
 * Deletes a cookie by name.
 *
 * If the cookie is not found, the operation is silently ignored.
 *
 * @param cookieName - Name of the cookie to delete
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function deleteCookie(this: XCUITestDriver, cookieName: string): Promise<void> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const cookies = await this.getCookies();
  const cookie = cookies.find(({name}) => name === cookieName);
  if (!cookie) {
    this.log.debug(`Cookie '${cookieName}' not found. Ignoring.`);
    return;
  }

  await _deleteCookie.bind(this)(cookie);
}

/**
 * Deletes all cookies for the current page.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function deleteCookies(this: XCUITestDriver): Promise<void> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const cookies = await this.getCookies();
  await B.all(cookies.map((cookie) => _deleteCookie.bind(this)(cookie)));
}

/**
 * Caches a web element for later use.
 *
 * @param el - Element to cache
 * @returns The cached element wrapper
 */
export function cacheWebElement(this: XCUITestDriver, el: Element | string): Element | string {
  if (!_.isPlainObject(el)) {
    return el;
  }
  const elId = util.unwrapElement(el);
  if (!isValidElementIdentifier(elId)) {
    return el;
  }
  // In newer debugger releases element identifiers look like `:wdc:1628151649325`
  // We assume it is safe to use these to identify cached elements
  const cacheId = _.includes(elId, ':') ? elId : util.uuidV4();
  this.webElementsCache.set(cacheId, elId);
  return util.wrapElement(cacheId);
}

/**
 * Recursively caches all web elements in a response object.
 *
 * @param response - Response object that may contain web elements
 * @returns Response with cached element wrappers
 */
export function cacheWebElements(this: XCUITestDriver, response: any): any {
  const toCached = (v: any) => (_.isArray(v) || _.isPlainObject(v)) ? this.cacheWebElements(v) : v;

  if (_.isArray(response)) {
    return response.map(toCached);
  } else if (_.isPlainObject(response)) {
    const result = {...response, ...(this.cacheWebElement(response) as Element)};
    return _.toPairs(result).reduce((acc, [key, value]) => {
      acc[key] = toCached(value);
      return acc;
    }, {} as any);
  }
  return response;
}

/**
 * Executes a Selenium atom script in the current web context.
 *
 * @param atom - Name of the atom to execute
 * @param args - Arguments to pass to the atom
 * @param alwaysDefaultFrame - If true, always use the default frame instead of current frames
 * @privateRemarks This should return `Promise<T>` where `T` extends `unknown`, but that's going to cause a lot of things to break.
 */
export async function executeAtom(this: XCUITestDriver, atom: string, args: unknown[], alwaysDefaultFrame: boolean = false): Promise<any> {
  const frames = alwaysDefaultFrame === true ? [] : this.curWebFrames;
  const promise = (this.remote as RemoteDebugger).executeAtom(atom, args, frames);
  return await this.waitForAtom(promise);
}

/**
 * Executes a Selenium atom script asynchronously.
 *
 * @param atom - Name of the atom to execute
 * @param args - Arguments to pass to the atom
 */
export async function executeAtomAsync(this: XCUITestDriver, atom: string, args: any[]): Promise<any> {
  // save the resolve and reject methods of the promise to be waited for
  const promise = new B((resolve, reject) => {
    this.asyncPromise = {resolve, reject};
  });
  await (this.remote as RemoteDebugger).executeAtomAsync(atom, args, this.curWebFrames);
  return await this.waitForAtom(promise);
}

/**
 * Gets the atoms-compatible element representation.
 *
 * @template S - Element identifier type
 * @param elOrId - Element or element ID
 * @returns Atoms-compatible element object
 * @throws {errors.StaleElementReferenceError} If the element is not in the cache
 */
export function getAtomsElement<S extends string = string>(this: XCUITestDriver, elOrId: S | Element<S>): AtomsElement<S> {
  const elId = util.unwrapElement(elOrId);
  if (!this.webElementsCache?.has(elId)) {
    throw new errors.StaleElementReferenceError();
  }
  return {ELEMENT: this.webElementsCache.get(elId)} as AtomsElement<S>;
}

/**
 * Converts elements in an argument array to atoms-compatible format.
 *
 * @param args - Array of arguments that may contain elements
 * @returns Array with elements converted to atoms format
 */
export function convertElementsForAtoms(this: XCUITestDriver, args: readonly any[] = []): any[] {
  return args.map((arg) => {
    if (hasElementId(arg)) {
      try {
        return this.getAtomsElement(arg);
      } catch (err) {
        if (!isErrorType(err, errors.StaleElementReferenceError)) {
          throw err;
        }
      }
      return arg;
    }
    return _.isArray(arg) ? this.convertElementsForAtoms(arg) : arg;
  });
}

/**
 * Extracts the element ID from an element object.
 *
 * @param element - Element object
 * @returns Element ID if found, undefined otherwise
 */
export function getElementId(element: any): string | undefined {
  return element?.ELEMENT || element?.[W3C_WEB_ELEMENT_IDENTIFIER];
}

/**
 * Checks if an object has an element ID (type guard).
 *
 * @param element - Object to check
 * @returns True if the object has an element ID
 */
export function hasElementId(element: any): element is Element {
  return (
    util.hasValue(element) &&
    (util.hasValue(element.ELEMENT) || util.hasValue(element[W3C_WEB_ELEMENT_IDENTIFIER]))
  );
}

/**
 * Finds one or more web elements using the specified strategy.
 *
 * @param strategy - Locator strategy (e.g., 'id', 'css selector')
 * @param selector - Selector value
 * @param many - If true, returns array of elements; if false, returns single element
 * @param ctx - Optional context element to search within
 * @returns Element or array of elements
 * @throws {errors.NoSuchElementError} If element not found and many is false
 */
export async function findWebElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  many?: boolean,
  ctx?: Element | string | null,
): Promise<Element | Element[]> {
  const contextElement = _.isNil(ctx) ? null : this.getAtomsElement(ctx);
  const atomName = many ? 'find_elements' : 'find_element_fragment';
  let element: any;
  const doFind = async () => {
    element = await this.executeAtom(atomName, [strategy, selector, contextElement]);
    return !_.isNull(element);
  };
  try {
    await this.implicitWaitForCondition(doFind);
  } catch (err: any) {
    if (err.message && _.isFunction(err.message.match) && err.message.match(/Condition unmet/)) {
      // condition was not met setting res to empty array
      element = [];
    } else {
      throw err;
    }
  }

  if (many) {
    return this.cacheWebElements(element);
  }
  if (_.isEmpty(element)) {
    throw new errors.NoSuchElementError();
  }
  return this.cacheWebElements(element);
}

/**
 * Clicks at the specified web coordinates.
 *
 * Coordinates are automatically translated from web to native coordinates.
 *
 * @param x - X coordinate in web space
 * @param y - Y coordinate in web space
 */
export async function clickWebCoords(this: XCUITestDriver, x: number, y: number): Promise<void> {
  const {x: translatedX, y: translatedY} = await this.translateWebCoords(x, y);
  await this.mobileTap(translatedX, translatedY);
}

/**
 * Determines if the current Safari session is running on an iPhone.
 *
 * The result is cached after the first call.
 *
 * @returns True if running on iPhone, false otherwise
 */
export async function getSafariIsIphone(this: XCUITestDriver): Promise<boolean> {
  if (_.isBoolean(this._isSafariIphone)) {
    return this._isSafariIphone;
  }
  try {
    const userAgent = await this.execute('return navigator.userAgent') as string;
    this._isSafariIphone = userAgent.toLowerCase().includes('iphone');
  } catch (err: any) {
    this.log.warn(`Unable to find device type from useragent. Assuming iPhone`);
    this.log.debug(`Error: ${err.message}`);
  }
  return this._isSafariIphone ?? true;
}

/**
 * Gets the device size from Safari's perspective.
 *
 * Returns normalized dimensions (width <= height).
 *
 * @returns Device size with width and height
 */
export async function getSafariDeviceSize(this: XCUITestDriver): Promise<Size> {
  const script =
    'return {height: window.screen.availHeight * window.devicePixelRatio, width: window.screen.availWidth * window.devicePixelRatio};';
  const {width, height} = await this.execute(script) as Size;
  const [normHeight, normWidth] = height > width ? [height, width] : [width, height];
  return {
    width: normWidth,
    height: normHeight,
  };
}

/**
 * Determines if the current device has a notch (iPhone X and later).
 *
 * The result is cached after the first call.
 *
 * @returns True if device has a notch, false otherwise
 */
export async function getSafariIsNotched(this: XCUITestDriver): Promise<boolean> {
  if (_.isBoolean(this._isSafariNotched)) {
    return this._isSafariNotched;
  }

  try {
    const {width, height} = await this.getSafariDeviceSize();
    for (const device of NOTCHED_DEVICE_SIZES) {
      if (device.w === width && device.h === height) {
        this._isSafariNotched = true;
      }
    }
  } catch (err: any) {
    this.log.warn(
      `Unable to find device type from dimensions. Assuming the device is not notched`,
    );
    this.log.debug(`Error: ${err.message}`);
  }
  return this._isSafariNotched ?? false;
}

/**
 * Calculates and applies extra offset for web coordinate translation.
 *
 * Takes into account Safari UI elements like tab bars, smart app banners, and device notches.
 * Modifies wvPos and realDims in place.
 *
 * @param wvPos - WebView position object (modified in place)
 * @param realDims - Real dimensions object (modified in place)
 * @throws {errors.InvalidArgumentError} If Safari tab bar position is invalid
 */
export async function getExtraTranslateWebCoordsOffset(
  this: XCUITestDriver,
  wvPos: {x: number; y: number},
  realDims: {w: number; h: number},
): Promise<void> {
  let topOffset = 0;
  let bottomOffset = 0;

  const isIphone = await this.getSafariIsIphone();

  // No need to check whether the Smart App Banner or Tab Bar is visible or not
  // if already defined by nativeWebTapTabBarVisibility or nativeWebTapSmartAppBannerVisibility in settings.
  const {
    nativeWebTapTabBarVisibility,
    nativeWebTapSmartAppBannerVisibility,
    safariTabBarPosition = util.compareVersions(this.opts.platformVersion as string, '>=', '15.0') &&
    isIphone
      ? TAB_BAR_POSITION_BOTTOM
      : TAB_BAR_POSITION_TOP,
  } = this.settings.getSettings();
  let tabBarVisibility = _.lowerCase(String(nativeWebTapTabBarVisibility));
  let bannerVisibility = _.lowerCase(String(nativeWebTapSmartAppBannerVisibility));
  const tabBarPosition = _.lowerCase(String(safariTabBarPosition));

  if (!VISIBILITIES.includes(tabBarVisibility as any)) {
    tabBarVisibility = DETECT;
  }
  if (!VISIBILITIES.includes(bannerVisibility as any)) {
    bannerVisibility = DETECT;
  }

  if (!TAB_BAR_POSSITIONS.includes(tabBarPosition as any)) {
    throw new errors.InvalidArgumentError(
      `${safariTabBarPosition} is invalid as Safari tab bar position. Available positions are ${TAB_BAR_POSSITIONS}.`,
    );
  }

  const isNotched = isIphone && (await this.getSafariIsNotched());

  const orientation = realDims.h > realDims.w ? 'PORTRAIT' : 'LANDSCAPE';

  const notchOffset = isNotched
    ? util.compareVersions(this.opts.platformVersion as string, '=', '13.0')
      ? IPHONE_X_NOTCH_OFFSET_IOS_13
      : IPHONE_X_NOTCH_OFFSET_IOS
    : 0;

  const isScrolled = await this.execute('return document.documentElement.scrollTop > 0') as boolean;
  if (isScrolled) {
    topOffset = IPHONE_SCROLLED_TOP_BAR_HEIGHT + notchOffset;

    if (isNotched) {
      topOffset -= IPHONE_X_SCROLLED_OFFSET;
    }

    // If the iPhone is landscape then there is no top bar
    if (orientation === 'LANDSCAPE' && isIphone) {
      topOffset = 0;
    }
  } else {
    topOffset = tabBarPosition === TAB_BAR_POSITION_BOTTOM ? 0 : IPHONE_TOP_BAR_HEIGHT;
    topOffset += notchOffset;
    this.log.debug(`tabBarPosition and topOffset: ${tabBarPosition}, ${topOffset}`);

    if (isIphone) {
      if (orientation === 'PORTRAIT') {
        // The bottom bar is only visible when portrait
        bottomOffset = IPHONE_BOTTOM_BAR_OFFSET;
      } else {
        topOffset = IPHONE_LANDSCAPE_TOP_BAR_HEIGHT;
      }
    }

    if (orientation === 'LANDSCAPE' || !isIphone) {
      if (tabBarVisibility === VISIBLE) {
        topOffset += TAB_BAR_OFFSET;
      } else if (tabBarVisibility === DETECT) {
        // Tabs only appear if the device is landscape or if it's an iPad so we only check visibility in this case
        // Assume that each tab bar is a WebView
        const contextsAndViews = await this.getContextsAndViews();
        const tabs = contextsAndViews.filter((ctx) => ctx.id.startsWith('WEBVIEW_'));

        if (tabs.length > 1) {
          this.log.debug(`Found ${tabs.length} tabs. Assuming the tab bar is visible`);
          topOffset += TAB_BAR_OFFSET;
        }
      }
    }
  }

  topOffset += await this.getExtraNativeWebTapOffset(isIphone, bannerVisibility);

  wvPos.y += topOffset;
  realDims.h -= topOffset + bottomOffset;
}

/**
 * Calculates additional offset for native web tap based on smart app banner visibility.
 *
 * @param isIphone - Whether the device is an iPhone
 * @param bannerVisibility - Banner visibility setting ('visible', 'invisible', or 'detect')
 * @returns Additional offset in pixels
 */
export async function getExtraNativeWebTapOffset(
  this: XCUITestDriver,
  isIphone: boolean,
  bannerVisibility: string,
): Promise<number> {
  let offset = 0;

  if (bannerVisibility === VISIBLE) {
    offset += isIphone
      ? IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET
      : IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET;
  } else if (bannerVisibility === DETECT) {
    // try to see if there is an Smart App Banner
    const banners = await this.findNativeElementOrElements('accessibility id', 'Close app download offer', true) as Element[];
    if (banners?.length) {
      offset += isIphone
        ? IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET
        : IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET;
    }
  }

  this.log.debug(`Additional native web tap offset computed: ${offset}`);
  return offset;
}

/**
 * Performs a native tap on a web element.
 *
 * Attempts to use a simple native tap first, falling back to coordinate-based tapping if needed.
 *
 * @param el - Element to tap
 */
export async function nativeWebTap(this: XCUITestDriver, el: any): Promise<void> {
  const atomsElement = this.getAtomsElement(el);

  // if strict native tap, do not try to do it with WDA directly
  if (
    !(this.settings.getSettings()).nativeWebTapStrict &&
    (await tapWebElementNatively.bind(this)(atomsElement))
  ) {
    return;
  }
  this.log.warn('Unable to do simple native web tap. Attempting to convert coordinates');

  const [size, coordinates] = await B.Promise.all([
    this.executeAtom('get_size', [atomsElement]),
    this.executeAtom('get_top_left_coordinates', [atomsElement]),
  ]) as [Size, Position];
  const {width, height} = size;
  const {x, y} = coordinates;
  await this.clickWebCoords(x + width / 2, y + height / 2);
}

/**
 * Translates web coordinates to native screen coordinates.
 *
 * Uses calibration data if available, otherwise falls back to legacy algorithm.
 *
 * @param x - X coordinate in web space
 * @param y - Y coordinate in web space
 * @returns Translated position in native coordinates
 * @throws {Error} If no WebView is found or if translation fails
 */
export async function translateWebCoords(this: XCUITestDriver, x: number, y: number): Promise<Position> {
  this.log.debug(`Translating web coordinates (${JSON.stringify({x, y})}) to native coordinates`);

  if (this.webviewCalibrationResult) {
    this.log.debug(`Will use the recent calibration result: ${JSON.stringify(this.webviewCalibrationResult)}`);
    const { offsetX, offsetY, pixelRatioX, pixelRatioY } = this.webviewCalibrationResult;
    const cmd = '(function () {return {innerWidth: window.innerWidth, innerHeight: window.innerHeight, ' +
      'outerWidth: window.outerWidth, outerHeight: window.outerHeight}; })()';
    const wvDims = await (this.remote as RemoteDebugger).execute(cmd) as {innerWidth: number; innerHeight: number; outerWidth: number; outerHeight: number};
    // https://tripleodeon.com/2011/12/first-understand-your-screen/
    const shouldApplyPixelRatio = wvDims.innerWidth > wvDims.outerWidth
      || wvDims.innerHeight > wvDims.outerHeight;
    return {
      x: offsetX + x * (shouldApplyPixelRatio ? pixelRatioX : 1),
      y: offsetY + y * (shouldApplyPixelRatio ? pixelRatioY : 1),
    };
  } else {
    this.log.debug(
      `Using the legacy algorithm for coordinates translation. ` +
      `Invoke 'mobile: calibrateWebToRealCoordinatesTranslation' to change that.`
    );
  }

  // absolutize web coords
  let webview: Element | undefined | string;
  try {
    webview = await retryInterval(
      5,
      100,
      async () =>
        await this.findNativeElementOrElements('class name', 'XCUIElementTypeWebView', false),
    ) as Element | undefined;
  } catch {}

  if (!webview) {
    throw new Error(`No WebView found. Unable to translate web coordinates for native web tap.`);
  }

  webview = util.unwrapElement(webview);

  const rect = await this.proxyCommand(`/element/${webview}/rect`, 'GET') as Rect;
  const wvPos = {x: rect.x, y: rect.y};
  const realDims = {w: rect.width, h: rect.height};

  const cmd = '(function () { return {w: window.innerWidth, h: window.innerHeight}; })()';
  const wvDims = await (this.remote as RemoteDebugger).execute(cmd) as {w: number; h: number};

  // keep track of implicit wait, and set locally to 0
  // https://github.com/appium/appium/issues/14988
  const implicitWaitMs = this.implicitWaitMs;
  this.setImplicitWait(0);
  try {
    await this.getExtraTranslateWebCoordsOffset(wvPos, realDims);
  } finally {
    this.setImplicitWait(implicitWaitMs);
  }
  if (!wvDims || !realDims || !wvPos) {
    throw new Error(
      `Web coordinates ${JSON.stringify({x, y})} cannot be translated into real coordinates. ` +
      `Try to invoke 'mobile: calibrateWebToRealCoordinatesTranslation' or consider translating the ` +
      `coordinates from the client code.`
    );
  }

  const xRatio = realDims.w / wvDims.w;
  const yRatio = realDims.h / wvDims.h;
  const newCoords = {
    x: wvPos.x + Math.round(xRatio * x),
    y: wvPos.y + Math.round(yRatio * y),
  };

  // additional logging for coordinates, since it is sometimes broken
  //   see https://github.com/appium/appium/issues/9159
  this.log.debug(`Converted coordinates: ${JSON.stringify(newCoords)}`);
  this.log.debug(`    rect: ${JSON.stringify(rect)}`);
  this.log.debug(`    wvPos: ${JSON.stringify(wvPos)}`);
  this.log.debug(`    realDims: ${JSON.stringify(realDims)}`);
  this.log.debug(`    wvDims: ${JSON.stringify(wvDims)}`);
  this.log.debug(`    xRatio: ${JSON.stringify(xRatio)}`);
  this.log.debug(`    yRatio: ${JSON.stringify(yRatio)}`);

  this.log.debug(
    `Converted web coords ${JSON.stringify({x, y})} into real coords ${JSON.stringify(
      newCoords,
    )}`,
  );
  return newCoords;
}

/**
 * Checks if an alert is currently present.
 *
 * @returns True if an alert is present, false otherwise
 */
export async function checkForAlert(this: XCUITestDriver): Promise<boolean> {
  return _.isString(await this.getAlertText());
}

/**
 * Waits for an atom promise to resolve, monitoring for alerts during execution.
 *
 * @param promise - Promise returned by atom execution
 * @returns The result of the atom execution
 * @throws {errors.UnexpectedAlertOpenError} If an alert appears during execution
 * @throws {errors.TimeoutError} If the atom execution times out
 */
export async function waitForAtom(this: XCUITestDriver, promise: Promise<any>): Promise<any> {
  const timer = new timing.Timer().start();

  const atomWaitTimeoutMs = _.isNumber(this.opts.webviewAtomWaitTimeout) && this.opts.webviewAtomWaitTimeout > 0
    ? this.opts.webviewAtomWaitTimeout
    : ATOM_WAIT_TIMEOUT_MS;
  // need to check for alert while the atom is being executed.
  // so notify ourselves when it happens
  const timedAtomPromise = B.resolve(promise).timeout(atomWaitTimeoutMs);
  const handlePromiseError = async (p: Promise<any>) => {
    try {
      return await p;
    } catch (err: any) {
      const originalError = err instanceof AggregateError ? err[0] : err;
      this.log.debug(`Error received while executing atom: ${originalError.message}`);
      throw (
        originalError instanceof TimeoutError
          ? (await generateAtomTimeoutError.bind(this)(timer))
          : originalError
      );
    }
  };
  // if the atom promise is fulfilled within ATOM_INITIAL_WAIT_MS
  // then we don't need to check for an alert presence
  await handlePromiseError(B.any([B.delay(ATOM_INITIAL_WAIT_MS), timedAtomPromise]));
  if (timedAtomPromise.isFulfilled()) {
    return await timedAtomPromise;
  }

  // ...otherwise make sure there is no unexpected alert covering the element
  this._waitingAtoms.count++;

  let onAlertCallback: (() => void) | undefined;
  let onAppCrashCallback: ((err: any) => void) | undefined;
  try {
    // only restart the monitor if it is not running already
    if (this._waitingAtoms.alertMonitor.isResolved()) {
      this._waitingAtoms.alertMonitor = B.resolve(
        (async () => {
          while (this._waitingAtoms.count > 0) {
            try {
              if (await this.checkForAlert()) {
                this._waitingAtoms.alertNotifier.emit(ON_OBSTRUCTING_ALERT_EVENT);
              }
            } catch (err: any) {
              if (isErrorType(err, errors.InvalidElementStateError)) {
                this._waitingAtoms.alertNotifier.emit(ON_APP_CRASH_EVENT, err);
              }
            }
            await B.delay(OBSTRUCTING_ALERT_PRESENCE_CHECK_INTERVAL_MS);
          }
        })(),
      );
    }

    return await new B((resolve, reject) => {
      onAlertCallback = () => reject(new errors.UnexpectedAlertOpenError());
      onAppCrashCallback = reject;
      this._waitingAtoms.alertNotifier.once(ON_OBSTRUCTING_ALERT_EVENT, onAlertCallback);
      this._waitingAtoms.alertNotifier.once(ON_APP_CRASH_EVENT, onAppCrashCallback);
      handlePromiseError(timedAtomPromise)
        .then(resolve)
        .catch(reject);
    });
  } finally {
    if (onAlertCallback) {
      this._waitingAtoms.alertNotifier.removeListener(
        ON_OBSTRUCTING_ALERT_EVENT,
        onAlertCallback,
      );
    }
    if (onAppCrashCallback) {
      this._waitingAtoms.alertNotifier.removeListener(ON_APP_CRASH_EVENT, onAppCrashCallback);
    }
    this._waitingAtoms.count--;
  }
}

/**
 * Performs browser navigation (back, forward, etc.) using history API.
 *
 * @param navType - Navigation type (e.g., 'back', 'forward')
 */
export async function mobileWebNav(this: XCUITestDriver, navType: string): Promise<void> {
  (this.remote as RemoteDebugger).allowNavigationWithoutReload = true;
  try {
    await this.executeAtom('execute_script', [`history.${navType}();`, null]);
  } finally {
    (this.remote as RemoteDebugger).allowNavigationWithoutReload = false;
  }
}

/**
 * Gets the base URL for accessing WDA HTTP endpoints.
 *
 * @returns The base URL (e.g., 'http://127.0.0.1:8100')
 */
export function getWdaLocalhostRoot(this: XCUITestDriver): string {
  const remotePort =
    ((this.isRealDevice() ? this.opts.wdaRemotePort : null)
      ?? this.wda?.url?.port
      ?? this.opts.wdaLocalPort)
  || 8100;
  const remoteIp = this.opts.wdaBindingIP ?? '127.0.0.1';
  return `http://${remoteIp}:${remotePort}`;
}

/**
 * Calibrates web to real coordinates translation.
 * This API can only be called from Safari web context.
 * It must load a custom page to the browser, and then restore
 * the original one, so don't call it if you can potentially
 * lose the current web app state.
 * The outcome of this API is then used in nativeWebTap mode.
 * The returned value could also be used to manually transform web coordinates
 * to real devices ones in client scripts.
 *
 * @returns Calibration data with offset and pixel ratio information
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function mobileCalibrateWebToRealCoordinatesTranslation(this: XCUITestDriver): Promise<CalibrationData> {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError('This API can only be called from a web context');
  }

  const currentUrl = await this.getUrl();
  await this.setUrl(`${this.getWdaLocalhostRoot()}/calibrate`);
  const {width, height} = await this.proxyCommand('/window/rect', 'GET') as Rect;
  const [centerX, centerY] = [width / 2, height / 2];
  const errorPrefix = 'Cannot determine web view coordinates offset. Are you in Safari context?';

  const performCalibrationTap = async (tapX: number, tapY: number): Promise<Position> => {
    await this.mobileTap(tapX, tapY);
    let result: Position;
    try {
      const title = await this.title();
      this.log.debug(JSON.stringify(title));
      result = _.isPlainObject(title) ? title as unknown as Position : JSON.parse(title) as Position;
    } catch (e: any) {
      throw new Error(`${errorPrefix} Original error: ${e.message}`);
    }
    const {x, y} = result;
    if (!_.isInteger(x) || !_.isInteger(y)) {
      throw new Error(errorPrefix);
    }
    return result;
  };

  await retryInterval(
    6,
    500,
    async () => {
      const {x: x0, y: y0} = await performCalibrationTap(
        centerX - CALIBRATION_TAP_DELTA_PX, centerY - CALIBRATION_TAP_DELTA_PX
      );
      const {x: x1, y: y1} = await performCalibrationTap(
        centerX + CALIBRATION_TAP_DELTA_PX, centerY + CALIBRATION_TAP_DELTA_PX
      );
      const pixelRatioX = CALIBRATION_TAP_DELTA_PX * 2 / (x1 - x0);
      const pixelRatioY = CALIBRATION_TAP_DELTA_PX * 2 / (y1 - y0);
      this.webviewCalibrationResult = {
        offsetX: centerX - CALIBRATION_TAP_DELTA_PX - x0 * pixelRatioX,
        offsetY: centerY - CALIBRATION_TAP_DELTA_PX - y0 * pixelRatioY,
        pixelRatioX,
        pixelRatioY,
      };
    }
  );

  if (currentUrl) {
    // restore the previous url
    await this.setUrl(currentUrl);
  }
  const result = this.webviewCalibrationResult as CalibrationData;
  return {
    ...result,
    offsetX: Math.round(result.offsetX),
    offsetY: Math.round(result.offsetY),
  };
}

/**
 * Updates Mobile Safari preferences on an iOS Simulator
 *
 * @param preferences - An object containing Safari settings to be updated.
 * The list of available setting names and their values can be retrieved by changing the
 * corresponding Safari settings in the UI and then inspecting
 * `Library/Preferences/com.apple.mobilesafari.plist` file inside of the `com.apple.mobilesafari`
 * app container within the simulator filesystem. The full path to Mobile Safari's container can
 * be retrieved by running `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari
 * data`. Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command to print
 * the plist content to the Terminal.
 *
 * @group Simulator Only
 * @throws {Error} If run on a real device
 * @throws {errors.InvalidArgumentError} If the preferences argument is invalid
 */
export async function mobileUpdateSafariPreferences(this: XCUITestDriver, preferences: Record<string, any>): Promise<void> {
  const simulator = assertSimulator.call(this, 'Updating Safari preferences');
  if (!_.isPlainObject(preferences)) {
    throw new errors.InvalidArgumentError('"preferences" argument must be a valid object');
  }

  this.log.debug(`About to update Safari preferences: ${JSON.stringify(preferences)}`);
  await simulator.updateSafariSettings(preferences);
}

/**
 * Generates a timeout error with detailed information about atom execution failure.
 *
 * @param timer - Timer instance to get duration from
 * @returns Timeout error with descriptive message
 */
async function generateAtomTimeoutError(this: XCUITestDriver, timer: timing.Timer): Promise<InstanceType<typeof errors.TimeoutError>> {
  let message = (
    `The remote Safari debugger did not respond to the requested ` +
    `command after ${timer.getDuration().asMilliSeconds}ms. `
  );
  message += (await this.remote?.isJavascriptExecutionBlocked()) ? (
    `It appears that JavaScript execution is blocked, ` +
    `which could be caused by either a modal dialog obstructing the current page, ` +
    `or a JavaScript routine monopolizing the event loop.`
  ) : (
    `However, the debugger still responds to JavaScript commands, ` +
    `which suggests that the provided atom script is taking too long to execute.`
  );
  if (_.isUndefined(this.opts.webviewAtomWaitTimeout)) {
    message += (
      ` You may also consider adjusting the timeout by setting the ` +
      `'webviewAtomWaitTimeout' driver capability.`
    );
  }
  return new errors.TimeoutError(message);
}

/**
 * Attempts to tap a web element using native element matching.
 *
 * Tries to find a native element by matching text content, then taps it directly.
 *
 * @param atomsElement - Atoms-compatible element to tap
 * @returns True if the native tap was successful, false otherwise
 */
async function tapWebElementNatively(this: XCUITestDriver, atomsElement: AtomsElement): Promise<boolean> {
  // try to get the text of the element, which will be accessible in the
  // native context
  try {
    const [text1, text2] = await B.all([
      this.executeAtom('get_text', [atomsElement]),
      this.executeAtom('get_attribute_value', [atomsElement, 'value'])
    ]) as [string | null, string | null];
    const text = text1 || text2;
    if (!text) {
      return false;
    }

    const els = await this.findNativeElementOrElements('accessibility id', text, true) as Element[];
    if (![1, 2].includes(els.length)) {
      return false;
    }

    const el = els[0];
    // use tap because on iOS 11.2 and below `nativeClick` crashes WDA
    const rect = await this.proxyCommand(
      `/element/${util.unwrapElement(el)}/rect`, 'GET'
    ) as Rect;
    if (els.length > 1) {
      const el2 = els[1];
      const rect2 = await this.proxyCommand(
        `/element/${util.unwrapElement(el2)}/rect`, 'GET',
      ) as Rect;

      if (
        rect.x !== rect2.x || rect.y !== rect2.y
        || rect.width !== rect2.width || rect.height !== rect2.height
      ) {
        // These 2 native elements are not referring to the same web element
        return false;
      }
    }
    await this.mobileTap(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return true;
  } catch (err: any) {
    // any failure should fall through and trigger the more elaborate
    // method of clicking
    this.log.warn(`Error attempting to click: ${err.message}`);
  }
  return false;
}

/**
 * Validates if a value is a valid element identifier.
 *
 * @param id - Value to validate
 * @returns True if the value is a valid element identifier
 */
function isValidElementIdentifier(id: any): boolean {
  if (!_.isString(id) && !_.isNumber(id)) {
    return false;
  }
  if (_.isString(id) && _.isEmpty(id)) {
    return false;
  }
  if (_.isNumber(id) && isNaN(id)) {
    return false;
  }
  return true;
}

/**
 * Creates a JavaScript cookie string.
 *
 * @param key - Cookie name
 * @param value - Cookie value
 * @param options - Cookie options (expires, path, domain, secure, httpOnly)
 * @returns Cookie string suitable for document.cookie
 */
function createJSCookie(key: string, value: string, options: {
  expires?: string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
} = {}): string {
  return [
    encodeURIComponent(key),
    '=',
    value,
    options.expires ? `; expires=${options.expires}` : '',
    options.path ? `; path=${options.path}` : '',
    options.domain ? `; domain=${options.domain}` : '',
    options.secure ? '; secure' : '',
  ].join('');
}

/**
 * Deletes a cookie via the remote debugger.
 *
 * @param cookie - Cookie object to delete
 */
async function _deleteCookie(this: XCUITestDriver, cookie: Cookie): Promise<any> {
  const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
  return await (this.remote as RemoteDebugger).deleteCookie(cookie.name, url);
}

