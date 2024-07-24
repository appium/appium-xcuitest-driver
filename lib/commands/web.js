import {errors, isErrorType} from 'appium/driver';
import {timing, util} from 'appium/support';
import {retryInterval} from 'asyncbox';
import B from 'bluebird';
import _ from 'lodash';
import cookieUtils from '../cookies';

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
const VISIBILITIES = [VISIBLE, INVISIBLE, DETECT];

// The position of Safari's tab (search bar).
// Since iOS 15, the bar is the bottom by default.
const TAB_BAR_POSITION_TOP = 'top';
const TAB_BAR_POSITION_BOTTOM = 'bottom';
const TAB_BAR_POSSITIONS = [TAB_BAR_POSITION_TOP, TAB_BAR_POSITION_BOTTOM];

/**
 * @this {XCUITestDriver}
 * @param {any} atomsElement
 * @returns {Promise<boolean>}
 */
async function tapWebElementNatively(atomsElement) {
  // try to get the text of the element, which will be accessible in the
  // native context
  try {
    const [text1, text2] = await B.all([
      this.executeAtom('get_text', [atomsElement]),
      this.executeAtom('get_attribute_value', [atomsElement, 'value'])
    ]);
    const text = text1 || text2;
    if (!text) {
      return false;
    }

    const els = await this.findNativeElementOrElements('accessibility id', text, true);
    if (![1, 2].includes(els.length)) {
      return false;
    }

    const el = els[0];
    // use tap because on iOS 11.2 and below `nativeClick` crashes WDA
    const rect = /** @type {import('@appium/types').Rect} */ (await this.proxyCommand(
      `/element/${util.unwrapElement(el)}/rect`, 'GET'
    ));
    if (els.length > 1) {
      const el2 = els[1];
      const rect2 = /** @type {import('@appium/types').Rect} */ (await this.proxyCommand(
        `/element/${util.unwrapElement(el2)}/rect`, 'GET',
      ));

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
  } catch (err) {
    // any failure should fall through and trigger the more elaborate
    // method of clicking
    this.log.warn(`Error attempting to click: ${err.message}`);
  }
  return false;
}

/**
 * @param {any} id
 * @returns {boolean}
 */
function isValidElementIdentifier(id) {
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

const commands = {
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async setFrame(frame) {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    if (_.isNull(frame)) {
      this.curWebFrames = [];
      this.log.debug('Leaving web frame and going back to default content');
      return;
    }

    if (helpers.hasElementId(frame)) {
      const atomsElement = this.getAtomsElement(frame);
      const value = await this.executeAtom('get_frame_window', [atomsElement]);
      this.log.debug(`Entering new web frame: '${value.WINDOW}'`);
      this.curWebFrames.unshift(value.WINDOW);
    } else {
      const atom = _.isNumber(frame) ? 'frame_by_index' : 'frame_by_id_or_name';
      const value = await this.executeAtom(atom, [frame]);
      if (_.isNull(value) || _.isUndefined(value.WINDOW)) {
        throw new errors.NoSuchFrameError();
      }
      this.log.debug(`Entering new web frame: '${value.WINDOW}'`);
      this.curWebFrames.unshift(value.WINDOW);
    }
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async getCssProperty(propertyName, el) {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    const atomsElement = this.getAtomsElement(el);
    return await this.executeAtom('get_value_of_css_property', [atomsElement, propertyName]);
  },
  /**
   * Submit the form an element is in
   *
   * @param {string|Element} el - the element ID
   * @group Mobile Web Only
   * @this {XCUITestDriver}
   */
  async submit(el) {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    const atomsElement = this.getAtomsElement(el);
    await this.executeAtom('submit', [atomsElement]);
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async refresh() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    await (/** @type {RemoteDebugger} */ (this.remote)).execute('window.location.reload()');
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async getUrl() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    return await (/** @type {RemoteDebugger} */ (this.remote)).execute('window.location.href');
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async title() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    return await (/** @type {RemoteDebugger} */ (this.remote)).execute('window.document.title');
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async getCookies() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    // get the cookies from the remote debugger, or an empty object
    const {cookies} = await (/** @type {RemoteDebugger} */ (this.remote)).getCookies();

    // the value is URI encoded, so decode it safely
    return cookies.map((cookie) => {
      if (!_.isEmpty(cookie.value)) {
        try {
          cookie.value = decodeURI(cookie.value);
        } catch (error) {
          this.log.debug(
            `Cookie ${cookie.name} was not decoded successfully. Cookie value: ${cookie.value}`,
          );
          this.log.warn(error);
          // Keep the original value
        }
      }
      return cookie;
    });
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async setCookie(cookie) {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    cookie = _.clone(cookie);

    // if `path` field is not specified, Safari will not update cookies as expected; eg issue #1708
    if (!cookie.path) {
      cookie.path = '/';
    }

    const jsCookie = cookieUtils.createJSCookie(cookie.name, cookie.value, {
      expires: _.isNumber(cookie.expiry)
        ? new Date(cookie.expiry * 1000).toUTCString()
        : cookie.expiry,
      path: cookie.path,
      domain: cookie.domain,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
    });
    let script = `document.cookie = ${JSON.stringify(jsCookie)}`;
    await this.executeAtom('execute_script', [script, []]);
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async deleteCookie(cookieName) {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    const cookies = await this.getCookies();
    const cookie = cookies.find(({name}) => name === cookieName);
    if (!cookie) {
      this.log.debug(`Cookie '${cookieName}' not found. Ignoring.`);
      return;
    }

    await this._deleteCookie(cookie);
  },
  /**
   * @this {XCUITestDriver}
   * @group Mobile Web Only
   */
  async deleteCookies() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }

    const cookies = await this.getCookies();
    await B.all(cookies.map((cookie) => this._deleteCookie(cookie)));
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  async _deleteCookie(cookie) {
    const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
    return await (/** @type {RemoteDebugger} */ (this.remote)).deleteCookie(cookie.name, url);
  },
  /**
   * @this {XCUITestDriver}
   */
  cacheWebElement(el) {
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
  },
  /**
   * @this {XCUITestDriver}
   */
  cacheWebElements(response) {
    const toCached = (v) => (_.isArray(v) || _.isPlainObject(v) ? this.cacheWebElements(v) : v);

    if (_.isArray(response)) {
      return response.map(toCached);
    } else if (_.isPlainObject(response)) {
      const result = {...response, ...this.cacheWebElement(response)};
      return _.toPairs(result).reduce((acc, [key, value]) => {
        acc[key] = toCached(value);
        return acc;
      }, {});
    }
    return response;
  },
  /**
   * @param {string} atom
   * @param {unknown[]} args
   * @returns {Promise<any>}
   * @privateRemarks This should return `Promise<T>` where `T` extends `unknown`, but that's going to cause a lot of things to break.
   * @this {XCUITestDriver}
   */
  async executeAtom(atom, args, alwaysDefaultFrame = false) {
    let frames = alwaysDefaultFrame === true ? [] : this.curWebFrames;
    let promise = (/** @type {RemoteDebugger} */ (this.remote)).executeAtom(atom, args, frames);
    return await this.waitForAtom(promise);
  },
  /**
   * @this {XCUITestDriver}
   * @param {string} atom
   * @param {any[]} args
   */
  async executeAtomAsync(atom, args) {
    // save the resolve and reject methods of the promise to be waited for
    let promise = new B((resolve, reject) => {
      this.asyncPromise = {resolve, reject};
    });
    await (/** @type {RemoteDebugger} */ (this.remote)).executeAtomAsync(atom, args, this.curWebFrames);
    return await this.waitForAtom(promise);
  },
  /**
   * @template {string} S
   * @param {S|Element<S>} elOrId
   * @returns {import('./types').AtomsElement<S>}
   * @this {XCUITestDriver}
   */
  getAtomsElement(elOrId) {
    const elId = util.unwrapElement(elOrId);
    if (!this.webElementsCache?.has(elId)) {
      throw new errors.StaleElementReferenceError();
    }
    return {ELEMENT: this.webElementsCache.get(elId)};
  },
  /**
   * @param {readonly any[]} [args]
   * @this {XCUITestDriver}
   */
  convertElementsForAtoms(args = []) {
    return args.map((arg) => {
      if (helpers.hasElementId(arg)) {
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
  },
  getElementId(element) {
    return element.ELEMENT || element[W3C_WEB_ELEMENT_IDENTIFIER];
  },
  /**
   * @param {any} element
   * @returns {element is Element}
   */
  hasElementId(element) {
    return (
      util.hasValue(element) &&
      (util.hasValue(element.ELEMENT) || util.hasValue(element[W3C_WEB_ELEMENT_IDENTIFIER]))
    );
  },
};

const extensions = {
  /**
   * @this {XCUITestDriver}
   */
  async findWebElementOrElements(strategy, selector, many, ctx) {
    const contextElement = _.isNil(ctx) ? null : this.getAtomsElement(ctx);
    const atomName = many ? 'find_elements' : 'find_element_fragment';
    let element;
    let doFind = async () => {
      element = await this.executeAtom(atomName, [strategy, selector, contextElement]);
      return !_.isNull(element);
    };
    try {
      await this.implicitWaitForCondition(doFind);
    } catch (err) {
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
  },
  /**
   * @this {XCUITestDriver}
   * @param {number} x
   * @param {number} y
   */
  async clickWebCoords(x, y) {
    const {x: translatedX, y: translatedY} = await this.translateWebCoords(x, y);
    await this.mobileTap(translatedX, translatedY);
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<boolean>}
   */
  async getSafariIsIphone() {
    if (_.isBoolean(this._isSafariIphone)) {
      return this._isSafariIphone;
    }
    try {
      const userAgent = /** @type {string} */ (await this.execute('return navigator.userAgent'));
      this._isSafariIphone = userAgent.toLowerCase().includes('iphone');
    } catch (err) {
      this.log.warn(`Unable to find device type from useragent. Assuming iPhone`);
      this.log.debug(`Error: ${err.message}`);
    }
    return this._isSafariIphone ?? true;
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<import('@appium/types').Size>}
   */
  async getSafariDeviceSize() {
    const script =
      'return {height: window.screen.availHeight * window.devicePixelRatio, width: window.screen.availWidth * window.devicePixelRatio};';
    const {width, height} = /** @type {import('@appium/types').Size} */ (
      await this.execute(script)
    );
    const [normHeight, normWidth] = height > width ? [height, width] : [width, height];
    return {
      width: normWidth,
      height: normHeight,
    };
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<boolean>}
   */
  async getSafariIsNotched() {
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
    } catch (err) {
      this.log.warn(
        `Unable to find device type from dimensions. Assuming the device is not notched`,
      );
      this.log.debug(`Error: ${err.message}`);
    }
    return this._isSafariNotched ?? false;
  },
  /**
   * @this {XCUITestDriver}
   */
  async getExtraTranslateWebCoordsOffset(wvPos, realDims) {
    let topOffset = 0;
    let bottomOffset = 0;

    const isIphone = await this.getSafariIsIphone();

    // No need to check whether the Smart App Banner or Tab Bar is visible or not
    // if already defined by nativeWebTapTabBarVisibility or nativeWebTapSmartAppBannerVisibility in settings.
    const {
      nativeWebTapTabBarVisibility,
      nativeWebTapSmartAppBannerVisibility,
      safariTabBarPosition = util.compareVersions(/** @type {string} */ (this.opts.platformVersion), '>=', '15.0') &&
      isIphone
        ? TAB_BAR_POSITION_BOTTOM
        : TAB_BAR_POSITION_TOP,
    } = this.settings.getSettings();
    let tabBarVisibility = _.lowerCase(String(nativeWebTapTabBarVisibility));
    let bannerVisibility = _.lowerCase(String(nativeWebTapSmartAppBannerVisibility));
    const tabBarPosition = _.lowerCase(String(safariTabBarPosition));

    if (!VISIBILITIES.includes(tabBarVisibility)) {
      tabBarVisibility = DETECT;
    }
    if (!VISIBILITIES.includes(bannerVisibility)) {
      bannerVisibility = DETECT;
    }

    if (!TAB_BAR_POSSITIONS.includes(tabBarPosition)) {
      throw new errors.InvalidArgumentError(
        `${safariTabBarPosition} is invalid as Safari tab bar position. Available positions are ${TAB_BAR_POSSITIONS}.`,
      );
    }

    const isNotched = isIphone && (await this.getSafariIsNotched());

    const orientation = realDims.h > realDims.w ? 'PORTRAIT' : 'LANDSCAPE';

    const notchOffset = isNotched
      ? util.compareVersions(/** @type {string} */ (this.opts.platformVersion), '=', '13.0')
        ? IPHONE_X_NOTCH_OFFSET_IOS_13
        : IPHONE_X_NOTCH_OFFSET_IOS
      : 0;

    const isScrolled = await this.execute('return document.documentElement.scrollTop > 0');
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
  },
  /**
   * @this {XCUITestDriver}
   * @param {boolean} isIphone
   * @param {string} bannerVisibility
   * @returns {Promise<number>}
   */
  async getExtraNativeWebTapOffset(isIphone, bannerVisibility) {
    let offset = 0;

    if (bannerVisibility === VISIBLE) {
      offset += isIphone
        ? IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET
        : IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET;
    } else if (bannerVisibility === DETECT) {
      // try to see if there is an Smart App Banner
      const banners = /** @type {import('@appium/types').Element[]} */ (
        await this.findNativeElementOrElements('accessibility id', 'Close app download offer', true)
      );
      if (banners?.length) {
        offset += isIphone
          ? IPHONE_WEB_COORD_SMART_APP_BANNER_OFFSET
          : IPAD_WEB_COORD_SMART_APP_BANNER_OFFSET;
      }
    }

    this.log.debug(`Additional native web tap offset computed: ${offset}`);
    return offset;
  },
  /**
   * @this {XCUITestDriver}
   * @param {any} el
   * @returns {Promise<void>}
   */
  async nativeWebTap(el) {
    const atomsElement = this.getAtomsElement(el);

    // if strict native tap, do not try to do it with WDA directly
    if (
      !(this.settings.getSettings()).nativeWebTapStrict &&
      (await tapWebElementNatively.bind(this)(atomsElement))
    ) {
      return;
    }
    this.log.warn('Unable to do simple native web tap. Attempting to convert coordinates');

    const [size, coordinates] =
      /** @type {[import('@appium/types').Size, import('@appium/types').Position]} */ (
        await B.Promise.all([
          this.executeAtom('get_size', [atomsElement]),
          this.executeAtom('get_top_left_coordinates', [atomsElement]),
        ])
      );
    const {width, height} = size;
    const {x, y} = coordinates;
    await this.clickWebCoords(x + width / 2, y + height / 2);
  },
  /**
   * @this {XCUITestDriver}
   * @param {number} x
   * @param {number} y
   * @returns {Promise<import('@appium/types').Position>}
   */
  async translateWebCoords(x, y) {
    this.log.debug(`Translating web coordinates (${JSON.stringify({x, y})}) to native coordinates`);

    if (this.webviewCalibrationResult) {
      this.log.debug(`Will use the recent calibration result: ${JSON.stringify(this.webviewCalibrationResult)}`);
      const { offsetX, offsetY, pixelRatioX, pixelRatioY } = this.webviewCalibrationResult;
      const cmd = '(function () {return {innerWidth: window.innerWidth, innerHeight: window.innerHeight, ' +
        'outerWidth: window.outerWidth, outerHeight: window.outerHeight}; })()';
      const wvDims = await (/** @type {RemoteDebugger} */ (this.remote)).execute(cmd);
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
    /** @type {import('@appium/types').Element|undefined|string} */
    let webview;
    try {
      webview = /** @type {import('@appium/types').Element|undefined} */ (
        await retryInterval(
          5,
          100,
          async () =>
            await this.findNativeElementOrElements('class name', 'XCUIElementTypeWebView', false),
        )
      );
    } catch (ign) {}

    if (!webview) {
      throw new Error(`No WebView found. Unable to translate web coordinates for native web tap.`);
    }

    webview = util.unwrapElement(webview);

    const rect = /** @type {Rect} */ (await this.proxyCommand(`/element/${webview}/rect`, 'GET'));
    const wvPos = {x: rect.x, y: rect.y};
    const realDims = {w: rect.width, h: rect.height};

    const cmd = '(function () { return {w: window.innerWidth, h: window.innerHeight}; })()';
    const wvDims = await (/** @type {RemoteDebugger} */ (this.remote)).execute(cmd);

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
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<boolean>}
   */
  async checkForAlert() {
    return _.isString(await this.getAlertText());
  },

  /**
   * @param {Promise<any>} promise
   * @this {XCUITestDriver}
   */
  async waitForAtom(promise) {
    const timer = new timing.Timer().start();

    const atomWaitTimeoutMs = _.isNumber(this.opts.webviewAtomWaitTimeout) && this.opts.webviewAtomWaitTimeout > 0
      ? this.opts.webviewAtomWaitTimeout
      : ATOM_WAIT_TIMEOUT_MS;
    // need to check for alert while the atom is being executed.
    // so notify ourselves when it happens
    const timedAtomPromise = B.resolve(promise).timeout(atomWaitTimeoutMs);
    const handlePromiseError = async (p) => {
      try {
        return await p;
      } catch (err) {
        const originalError = err instanceof B.AggregateError ? err[0] : err;
        this.log.debug(`Error received while executing atom: ${originalError.message}`);
        if (originalError instanceof B.TimeoutError) {
          throw new errors.TimeoutError(
            `Did not get any response for atom execution after ` +
              `${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
          );
        }
        throw originalError;
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

    let onAlertCallback;
    let onAppCrashCallback;
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
              } catch (err) {
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
          // eslint-disable-next-line promise/prefer-await-to-then
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
  },

  /**
   * @param {string} navType
   * @this {XCUITestDriver}
   */
  async mobileWebNav(navType) {
    (/** @type {RemoteDebugger} */ (this.remote)).allowNavigationWithoutReload = true;
    try {
      await this.executeAtom('execute_script', [`history.${navType}();`, null]);
    } finally {
      (/** @type {RemoteDebugger} */ (this.remote)).allowNavigationWithoutReload = false;
    }
  },

  /**
   * @this {XCUITestDriver}
   * @returns {string} The base url which could be used to access WDA HTTP endpoints
   * FROM THE SAME DEVICE where WDA is running
   */
  getWdaLocalhostRoot() {
    const remotePort =
      ((this.isRealDevice() ? this.opts.wdaRemotePort : null)
        ?? this.wda?.url?.port
        ?? this.opts.wdaLocalPort)
      || 8100;
    return `http://127.0.0.1:${remotePort}`;
  },

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
   * @this {XCUITestDriver}
   * @returns {Promise<import('../types').CalibrationData>}
   */
  async mobileCalibrateWebToRealCoordinatesTranslation() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError('This API can only be called from a web context');
    }

    const currentUrl = await this.getUrl();
    await this.setUrl(`${this.getWdaLocalhostRoot()}/calibrate`);
    const {width, height} = /** @type {import('@appium/types').Size} */(await this.proxyCommand(`/window/size`, 'GET'));
    const [centerX, centerY] = [width / 2, height / 2];
    const errorPrefix = 'Cannot determine web view coordinates offset. Are you in Safari context?';

    const performCalibrationTap = async (/** @type {number} */ tapX, /** @type {number} */ tapY) => {
      await this.mobileTap(tapX, tapY);
      /** @type {import('@appium/types').Position} */
      let result;
      try {
        const title = await this.title();
        this.log.debug(JSON.stringify(title));
        result = _.isPlainObject(title) ? title : JSON.parse(title);
      } catch (e) {
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
    const result = /** @type {import('../types').CalibrationData} */ (this.webviewCalibrationResult);
    return {
      ...result,
      offsetX: Math.round(result.offsetX),
      offsetY: Math.round(result.offsetY),
    };
  },

  /**
   * @typedef {Object} SafariOpts
   * @property {object} preferences An object containing Safari settings to be updated.
   * The list of available setting names and their values could be retrieved by
   * changing the corresponding Safari settings in the UI and then inspecting
   * 'Library/Preferences/com.apple.mobilesafari.plist' file inside of
   * com.apple.mobilesafari app container.
   * The full path to the Mobile Safari's container could be retrieved from
   * `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari data`
   * command output.
   * Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command
   * to print the plist content to the Terminal.
   */

  /**
   * Updates Mobile Safari preferences on an iOS Simulator
   *
   * @param {import('@appium/types').StringRecord} preferences - An object containing Safari settings to be updated.
   * The list of available setting names and their values can be retrieved by changing the
   * corresponding Safari settings in the UI and then inspecting
   * `Library/Preferences/com.apple.mobilesafari.plist` file inside of the `com.apple.mobilesafari`
   * app container within the simulator filesystem. The full path to Mobile Safari's container can
   * be retrieved by running `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari
   * data`. Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command to print
   * the plist content to the Terminal.
   *
   * @group Simulator Only
   * @returns {Promise<void>}
   * @throws {Error} if run on a real device or if the preferences argument is invalid
   * @this {XCUITestDriver}
   */
  async mobileUpdateSafariPreferences(preferences) {
    if (!this.isSimulator()) {
      throw new Error('This extension is only available for Simulator');
    }
    if (!_.isPlainObject(preferences)) {
      throw new errors.InvalidArgumentError('"preferences" argument must be a valid object');
    }

    this.log.debug(`About to update Safari preferences: ${JSON.stringify(preferences)}`);
    await /** @type {import('../driver').Simulator} */ (this.device).updateSafariSettings(preferences);
  },
};

export default {...helpers, ...extensions, ...commands};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('@appium/types').Rect} Rect
 */

/**
 * @template {string} [S=string]
 * @typedef {import('@appium/types').Element<S>} Element
 */

/**
 * @typedef {import('appium-remote-debugger').RemoteDebugger} RemoteDebugger
 */