import { util, timing } from 'appium/support';
import _ from 'lodash';
import B from 'bluebird';
import { errors, isErrorType } from 'appium/driver';
import cookieUtils from '../cookies';
import { EventEmitter } from 'events';

const PORTRAIT = 'portrait';
const LANDSCAPE = 'landscape';

// Resolution Ref: https://www.ios-resolution.com/
// Need to update when Apple releases new notch models
const NOTCHED_DEVICE_SIZES = [
  {w: 1125, h: 2436}, // 11 Pro, X, Xs
  {w: 828, h: 1792}, // 11, Xr
  {w: 1242, h: 2688}, // 11 Pro Max, Xs Max
  {w: 1080, h: 2340}, // 12 mini, 13 mini
  {w: 1170, h: 2532}, // 12, 12 Pro, 13, 13 Pro
  {w: 1284, h: 2778}, // 12 Pro Max, 13 Pro Max
];

const { W3C_WEB_ELEMENT_IDENTIFIER } = util;

const ATOM_WAIT_TIMEOUT_MS = 2 * 60000;
const ATOM_INITIAL_WAIT_MS = 1000;

const ON_OBSTRUCTING_ALERT_EVENT = 'alert';

// The position of Safari's tab (search bar).
// Since iOS 15, the bar is the bottom by default.
const TAB_BAR_POSITION_TOP = 'top';
const TAB_BAR_POSITION_BOTTOM = 'bottom';
const TAB_BAR_POSITIONS = [TAB_BAR_POSITION_TOP, TAB_BAR_POSITION_BOTTOM];

const commands = {}, helpers = {}, extensions = {};

function isValidElementIdentifier (id) {
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

commands.setFrame = async function setFrame (frame) {
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
};

commands.getCssProperty = async function getCssProperty (propertyName, el) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const atomsElement = this.getAtomsElement(el);
  return await this.executeAtom('get_value_of_css_property', [atomsElement, propertyName]);
};

commands.submit = async function submit (el) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const atomsElement = this.getAtomsElement(el);
  await this.executeAtom('submit', [atomsElement]);
};

commands.refresh = async function refresh () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  await this.executeAtom('refresh', []);
};

commands.getUrl = async function getUrl () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await this.remote.execute('window.location.href');
};

commands.title = async function title () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await this.executeAtom('title', [], true);
};

commands.getCookies = async function getCookies () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  this.log.debug('Retrieving all cookies');

  let script = 'return document.cookie';
  let jsCookies = await this.executeAtom('execute_script', [script, []]);

  let cookies = [];
  try {
    for (let [name, value] of _.toPairs(cookieUtils.createJWPCookie(undefined, jsCookies))) {
      cookies.push({name, value});
    }
    return cookies;
  } catch (err) {
    this.log.error(err);
    throw new errors.UnknownError(`Error parsing cookies from result: '${jsCookies}'`);
  }
};

commands.setCookie = async function setCookie (cookie) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  cookie = _.clone(cookie);

  // if `path` field is not specified, Safari will not update cookies as expected; eg issue #1708
  if (!cookie.path) {
    cookie.path = '/';
  }

  const jsCookie = cookieUtils.createJSCookie(cookie.name, cookie.value, {
    expires: _.isNumber(cookie.expiry) ? (new Date(cookie.expiry * 1000)).toUTCString() :
      cookie.expiry,
    path: cookie.path,
    domain: cookie.domain,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure
  });
  let script = `document.cookie = ${JSON.stringify(jsCookie)}`;
  await this.executeAtom('execute_script', [script, []]);
};

commands.deleteCookie = async function deleteCookie (cookieName) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  // check cookie existence
  let cookies = await this.getCookies();
  if (_.indexOf(_.map(cookies, 'name'), cookieName) === -1) {
    this.log.debug(`Cookie '${cookieName}' not found. Ignoring.`);
    return true;
  }

  return await this._deleteCookie(cookieName);
};

commands.deleteCookies = async function deleteCookies () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  let cookies = await this.getCookies();
  if (cookies.length) {
    for (let cookie of cookies) {
      await this._deleteCookie(cookie.name);
    }
  }
  return true;
};

helpers._deleteCookie = async function _deleteCookie (cookieName) {
  this.log.debug(`Deleting cookie '${cookieName}'`);
  let webCookie = cookieUtils.expireCookie(cookieName, {path: '/'});
  let script = `document.cookie = ${JSON.stringify(webCookie)}`;
  await this.executeAtom('execute_script', [script, []]);
};

helpers.cacheWebElement = function cacheWebElement (el) {
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
};

helpers.cacheWebElements = function cacheWebElements (response) {
  const toCached = (v) => _.isArray(v) || _.isPlainObject(v)
    ? this.cacheWebElements(v)
    : v;

  if (_.isArray(response)) {
    return response.map(toCached);
  } else if (_.isPlainObject(response)) {
    const result = {...response, ...(this.cacheWebElement(response))};
    return _.toPairs(result).reduce(
      (acc, [key, value]) => {
        acc[key] = toCached(value);
        return acc;
      }, {}
    );
  }
  return response;
};

extensions.findWebElementOrElements = async function findWebElementOrElements (strategy, selector, many, ctx) {
  const contextElement = _.isNil(ctx) ? null : this.getAtomsElement(ctx);
  let element;
  let doFind = async () => {
    element = await this.executeAtom(`find_element${many ? 's' : ''}`, [strategy, selector, contextElement]);
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
};

extensions.clickWebCoords = async function clickWebCoords () {
  let coords = await this.translateWebCoords(this.curWebCoords);
  await this.clickCoords(coords);
};

helpers.executeAtom = async function executeAtom (atom, args, alwaysDefaultFrame = false) {
  let frames = alwaysDefaultFrame === true ? [] : this.curWebFrames;
  let promise = this.remote.executeAtom(atom, args, frames);
  return await this.waitForAtom(promise);
};

helpers.executeAtomAsync = async function executeAtomAsync (atom, args, responseUrl) {
  // save the resolve and reject methods of the promise to be waited for
  let promise = new B((resolve, reject) => {
    this.asyncPromise = {resolve, reject};
  });
  await this.remote.executeAtomAsync(atom, args, this.curWebFrames, responseUrl);
  return await this.waitForAtom(promise);
};

helpers.getAtomsElement = function getAtomsElement (elOrId) {
  const elId = util.unwrapElement(elOrId);
  if (!this.webElementsCache.has(elId)) {
    throw new errors.StaleElementReferenceError();
  }
  return {ELEMENT: this.webElementsCache.get(elId)};
};

helpers.convertElementsForAtoms = function convertElementsForAtoms (args = []) {
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
};

helpers.getElementId = function getElementId (element) {
  return element.ELEMENT || element[W3C_WEB_ELEMENT_IDENTIFIER];
};

helpers.hasElementId = function hasElementId (element) {
  return util.hasValue(element) && (util.hasValue(element.ELEMENT) || util.hasValue(element[W3C_WEB_ELEMENT_IDENTIFIER]));
};

extensions.getSafariIsIphone = async function getSafariIsIphone () {
  if (_.isBoolean(this._isSafariIphone)) {
    return this._isSafariIphone;
  }
  try {
    const userAgent = await this.execute('return navigator.userAgent');
    this._isSafariIphone = userAgent.toLowerCase().includes('iphone');
  } catch (err) {
    this.log.warn(`Unable to find device type from useragent. Assuming iPhone`);
    this.log.debug(`Error: ${err.message}`);
  }
  return this._isSafariIphone ?? true;
};

extensions.getSafariIsIpad = _.memoize(async function getSafariIsIpad () {
  try {
    return await this.execute(`return (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0) || navigator.platform === 'iPad'`);
  } catch (ign) {
    return false;
  }
});

extensions.getSafariDeviceSize = async function getSafariDeviceSize () {
  // Why did I not use availWidth/Height?
  // It seems that Safari on iPad is not able to get the correct size of the screen on different orientations
  const getSizeScript =
    `let { innerWidth, innerHeight, screen, devicePixelRatio } = window;
    const { height, width } = screen;
    const physicalWidth = width * devicePixelRatio;
    const physicalHeight = height * devicePixelRatio;
    const orientation = height > width ? '${PORTRAIT}' : '${LANDSCAPE}';
    let scaleUpRatio = 1;`;

  // - Viewport gave wrong value of innerHeight/innerWidth in some websites on iPad. (Eg: google.com)
  // Ref: https://stackoverflow.com/questions/4629969/ios-return-bad-value-for-window-innerheight-width
  // Though the innerHeight/innerWidth is not correct, but the ratio of physicalWidth/physicalHeight is correct.
  // - The scale-up ratio is used to convert the coordinates got from API to correct coordinates..
  const fixIPadIssueScript = await this.getSafariIsIpad() ?
    `// Assuming the viewport width is matching the device width
    const innerRatio = innerHeight / innerWidth;
    scaleUpRatio = innerWidth / width;
    // Reset innerWidth/innerHeight
    innerWidth = width;
    innerHeight = Math.round(width * innerRatio);` : '';

  const returnScript =
    `return {
      screenWidth: width,
      screenHeight: height,
      webviewWidth: innerWidth,
      webviewHeight: innerHeight,
      physicalWidth,
      physicalHeight,
      orientation,
      scaleUpRatio,
    };`;

  return await this.execute(getSizeScript + fixIPadIssueScript + returnScript);
};

extensions.getSafariIsNotched = async function getSafariIsNotched () {
  if (_.isBoolean(this._isSafariNotched)) {
    return this._isSafariNotched;
  }

  try {
    const {physicalWidth, physicalHeight} = await this.getSafariDeviceSize();
    for (const device of NOTCHED_DEVICE_SIZES) {
      if (device.w === physicalWidth && device.h === physicalHeight) {
        this._isSafariNotched = true;
      }
    }
  } catch (err) {
    this.log.warn(`Unable to find device type from dimensions. Assuming the device is not notched`);
    this.log.debug(`Error: ${err.message}`);
  }
  return this._isSafariNotched ?? false;
};

extensions.isToolbarCollapsed = _.memoize(function isToolbarCollapsed (isIphone, orientation, screenHeight, webviewHeight) {
  const remainHeight = screenHeight - webviewHeight;
  if (isIphone) {
    if (orientation === PORTRAIT) {
      return remainHeight < 100;
    } else if (orientation === LANDSCAPE) {
      return remainHeight === 0;
    }
  } else {
    return remainHeight < 50;
  }
}, (...args) => JSON.stringify(args));

extensions.getWebViewRect = async function getWebViewRect () {
  const isIphone = await this.getSafariIsIphone();
  const isNotched = isIphone && await this.getSafariIsNotched();
  const {screenWidth, screenHeight, webviewWidth, webviewHeight, orientation, scaleUpRatio} = await this.getSafariDeviceSize();
  const remainHeight = screenHeight - webviewHeight;
  const remainWidth = screenWidth - webviewWidth;
  const isCollapsed = this.isToolbarCollapsed(isIphone, orientation, screenHeight, webviewHeight);

  const {safariTabBarPosition = TAB_BAR_POSITION_BOTTOM} = await this.settings.getSettings();

  if (
    isIphone &&
    util.compareVersions(this.opts.platformVersion, '>=', '15.0') &&
    !TAB_BAR_POSITIONS.includes(safariTabBarPosition)
  ) {
    throw new errors.InvalidArgumentError(
      `${safariTabBarPosition} is invalid as Safari tab bar position. Available positions are ${TAB_BAR_POSITIONS}.`
    );
  }

  let x = 0;
  let y = 0;

  if (
    ((util.compareVersions(this.opts.platformVersion, '>=', '15.0') &&
      safariTabBarPosition === TAB_BAR_POSITION_TOP) ||
      util.compareVersions(this.opts.platformVersion, '<', '15.0')) &&
    isIphone &&
    orientation === PORTRAIT
  ) {
    if (isCollapsed) {
      // offset with actual: 1
      y = remainHeight + 1;
    } else if (isNotched) {
      // offset with actual: -3, fixed bottom: 49, fixed indicator: 30
      y = remainHeight - 82; // = - 3 - 49 - 30
    } else {
      // offset with actual: 1, fixed bottom: 44
      y = remainHeight - 43; // = 1 - 44
    }
  } else if (util.compareVersions(this.opts.platformVersion, '<', '15.0')) {
    if (isIphone) {
      if (isNotched) {
        x = remainWidth / 2;
        if (!isCollapsed) {
          // offset with actual: 1
          y = remainHeight + 1;
        }
      }
    } else {
      // offset with actual: 1
      y = remainHeight + 1;
    }
  } else if (isIphone) {
    if (orientation === PORTRAIT) {
      if (isNotched) {
        // Fixed top: 47
        y = 47;
      } else {
        // Fixed status bar: 20
        y = 20;
      }
    } else if (isNotched) {
      x = remainWidth / 2;
      if (!isCollapsed) {
        // Fixed top: 48
        y = 48;
      }
    } else if (!isCollapsed) {
      // Fixed top: 60
      y = 60;
    }
  } else {
    y = remainHeight;
  }

  return {x, y, webviewWidth, webviewHeight, scaleUpRatio, screenWidth, screenHeight, orientation};
};

async function tapWebElementNatively (driver, atomsElement) {
  // try to get the text of the element, which will be accessible in the
  // native context
  try {
    let text = await driver.executeAtom('get_text', [atomsElement]);
    if (!text) {
      text = await driver.executeAtom('get_attribute_value', [atomsElement, 'value']);
    }

    if (text) {
      const els = await driver.findNativeElementOrElements('accessibility id', text, true);
      if (els.length === 1 || els.length === 2) {
        const el = els[0];
        // use tap because on iOS 11.2 and below `nativeClick` crashes WDA
        const rect = await driver.proxyCommand(`/element/${util.unwrapElement(el)}/rect`, 'GET');
        if (els.length === 2) {
          const el2 = els[1];
          const rect2 = await driver.proxyCommand(`/element/${util.unwrapElement(el2)}/rect`, 'GET');

          if ((rect.x !== rect2.x || rect.y !== rect2.y) ||
          (rect.width !== rect2.width || rect.height !== rect2.height)) {
            // These 2 native elements are not referring to the same web element
            return false;
          }
        }
        const coords = {
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
        };
        await driver.clickCoords(coords);
        return true;
      }
    }
  } catch (err) {
    // any failure should fall through and trigger the more elaborate
    // method of clicking
    driver.log.warn(`Error attempting to click: ${err.message}`);
  }
  return false;
}

extensions.nativeWebTap = async function nativeWebTap (el) {
  const atomsElement = this.getAtomsElement(el);

  // if strict native tap, do not try to do it with WDA directly
  if (!(await this.settings.getSettings()).nativeWebTapStrict && await tapWebElementNatively(this, atomsElement)) {
    return;
  }
  this.log.warn('Unable to do simple native web tap. Attempting to convert coordinates');

  // `get_top_left_coordinates` returns the wrong value sometimes,
  // unless we pre-call both of these functions before the actual calls
  await B.Promise.all([
    this.executeAtom('get_size', [atomsElement]),
    this.executeAtom('get_top_left_coordinates', [atomsElement]),
  ]);

  const [size, coordinates] = await B.Promise.all([
    this.executeAtom('get_size', [atomsElement]),
    this.executeAtom('get_top_left_coordinates', [atomsElement]),
  ]);
  const {width, height} = size;
  let {x, y} = coordinates;
  x += width / 2;
  y += height / 2;

  this.curWebCoords = {x, y};
  await this.clickWebCoords();
};

extensions.clickCoords = async function clickCoords (coords) {
  await this.performActions([
    {
      type: 'pointer',
      id: 'finger1',
      parameters: {
        pointerType: 'touch'
      },
      actions: [
        {
          type: 'pointerMove',
          duration: 0,
          x: coords.x,
          y: coords.y,
        },
        {
          type: 'pointerDown',
          button: 0,
        },
        {
          type: 'pointerUp',
          button: 0,
        },
      ]
    }
  ]);
};

extensions.translateWebCoords = async function translateWebCoords (coords) {
  this.log.debug(`Translating web coordinates (${JSON.stringify(coords)}) to real coordinates`);

  // keep track of implicit wait, and set locally to 0
  // https://github.com/appium/appium/issues/14988
  const implicitWaitMs = this.implicitWaitMs;
  await this.setImplicitWait(0);
  let wvRect = {x: 0, y: 0};
  try {
    wvRect = await this.getWebViewRect();
  } finally {
    await this.setImplicitWait(implicitWaitMs);
  }
  const {x, y, webviewWidth, webviewHeight, scaleUpRatio, screenWidth, screenHeight, orientation} = wvRect;
  const newCoords = {
    // x, y are already scaled, need to get real coordinates.
    x: Math.round(coords.x / scaleUpRatio) + x,
    y: Math.round(coords.y / scaleUpRatio) + y,
  };

  // additional logging for coordinates, since it is sometimes broken
  //   see https://github.com/appium/appium/issues/9159
  this.log.debug(`Converted web coords ${JSON.stringify(coords)} ` +
    `into real coords ${JSON.stringify(newCoords)}`);
  this.log.debug(`    Webview coords: ${JSON.stringify({x, y})}`);
  this.log.debug(`    Webview dimension: ${JSON.stringify({w: webviewWidth, h: webviewHeight})}`);
  this.log.debug(`    Screen dimension: ${JSON.stringify({w: screenWidth, h: screenHeight})}`);
  this.log.debug(`    Orientation: ${orientation}`);
  this.log.debug(`    Scale ratio: ${scaleUpRatio}`);
  return newCoords;
};

extensions.checkForAlert = async function checkForAlert () {
  return _.isString(await this.getAlertText());
};

extensions.waitForAtom = async function waitForAtom (promise) {
  const timer = new timing.Timer().start();

  // need to check for alert while the atom is being executed.
  // so notify ourselves when it happens
  const timedAtomPromise = B.resolve(promise).timeout(ATOM_WAIT_TIMEOUT_MS);
  const handlePromiseError = async (p) => {
    try {
      return await p;
    } catch (err) {
      const originalError = (err instanceof B.AggregateError) ? err[0] : err;
      this.log.debug(`Error received while executing atom: ${originalError.message}`);
      if (originalError instanceof B.TimeoutError) {
        throw new Error(`Did not get any response for atom execution after ` +
          `${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
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
  if (!_.isPlainObject(this._waitingAtoms)) {
    this._waitingAtoms = {
      count: 0,
      alertNotifier: new EventEmitter(),
      alertMonitor: B.resolve(),
    };
  }
  this._waitingAtoms.count++;

  let onAlertCallback;
  try {
    // only restart the monitor if it is not running already
    if (this._waitingAtoms.alertMonitor.isResolved()) {
      this._waitingAtoms.alertMonitor = B.resolve((async () => {
        while (this._waitingAtoms.count > 0) {
          try {
            if (await this.checkForAlert()) {
              this._waitingAtoms.alertNotifier.emit(ON_OBSTRUCTING_ALERT_EVENT);
            }
          } catch (ign) {}
          await B.delay(ATOM_INITIAL_WAIT_MS / 2);
        }
      })());
    }

    return await new B((resolve, reject) => {
      onAlertCallback = () => reject(new errors.UnexpectedAlertOpenError());
      this._waitingAtoms.alertNotifier.once(ON_OBSTRUCTING_ALERT_EVENT, onAlertCallback);
      handlePromiseError(timedAtomPromise)
        // eslint-disable-next-line promise/prefer-await-to-then
        .then(resolve)
        .catch(reject);
    });
  } finally {
    if (onAlertCallback) {
      this._waitingAtoms.alertNotifier.removeListener(ON_OBSTRUCTING_ALERT_EVENT, onAlertCallback);
    }
    this._waitingAtoms.count--;
  }
};

extensions.mobileWebNav = async function mobileWebNav (navType) {
  this.remote.allowNavigationWithoutReload = true;
  try {
    await this.executeAtom('execute_script', [`history.${navType}();`, null]);
  } finally {
    this.remote.allowNavigationWithoutReload = false;
  }
};

Object.assign(commands, extensions, helpers);

export default commands;
