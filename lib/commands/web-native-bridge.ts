import type {Element, Position, Rect, Size} from '@appium/types';
import {util} from 'appium/support.js';
import {retryInterval} from 'asyncbox';

import type {XCUITestDriver} from '../driver.js';
import type {CalibrationCacheEntry, CalibrationData, CalibrationSample, ViewportState} from '../types.js';
import {toErrorMessage} from '../utils/index.js';
import {requireWebContext} from './helpers/index.js';
import type {AtomsElement} from './types.js';

// Native taps used to fit the calibration transform are placed this many
// pixels away (in native screen coordinates) from the webview's center point.
const CALIBRATION_TAP_DELTA_PX = 7;
const CALIBRATION_RETRIES = 6;
const CALIBRATION_RETRY_INTERVAL_MS = 500;

// A native tap resolves once WDA has dispatched the touch, which can race
// the webview's own JS click handler recording it; poll briefly rather than
// reading back exactly once.
const CALIBRATION_TAP_READBACK_RETRIES = 10;
const CALIBRATION_TAP_READBACK_INTERVAL_MS = 100;

// Window-scoped property names the calibration overlay uses to stash its
// state across the several `execute_script` round trips a calibration takes.
const CALIBRATION_OVERLAY_MARKER = '__appiumCalibrationOverlay';
const CALIBRATION_TAPS_MARKER = '__appiumCalibrationTaps';

// Injects a temporary, full-viewport, click-capturing overlay into the
// current DOM. This is what lets calibration be fitted against whatever
// chrome/scroll/orientation state the page is actually in, without
// navigating away from the page under test.
//
// Always tears down and rebuilds from scratch (rather than reusing an
// existing overlay/taps array) so that a retry after a failed attempt can
// never inherit stale taps left over from a previous attempt whose cleanup
// call didn't actually reach the page (e.g. a transport hiccup).
const INJECT_CALIBRATION_OVERLAY_SCRIPT = `
  if (window.${CALIBRATION_OVERLAY_MARKER}) {
    window.${CALIBRATION_OVERLAY_MARKER}.remove();
  }
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'margin:0;padding:0;border:0;background:transparent;z-index:2147483647;';
  window.${CALIBRATION_TAPS_MARKER} = [];
  overlay.addEventListener('click', function (e) {
    window.${CALIBRATION_TAPS_MARKER}.push({x: e.clientX, y: e.clientY});
  }, true);
  (document.body || document.documentElement).appendChild(overlay);
  window.${CALIBRATION_OVERLAY_MARKER} = overlay;
`;

const REMOVE_CALIBRATION_OVERLAY_SCRIPT = `
  if (window.${CALIBRATION_OVERLAY_MARKER}) {
    window.${CALIBRATION_OVERLAY_MARKER}.remove();
    delete window.${CALIBRATION_OVERLAY_MARKER};
    delete window.${CALIBRATION_TAPS_MARKER};
  }
`;

// Returns every tap the overlay has observed so far, so the caller can
// correlate a specific tap by index instead of trusting that the most
// recently pushed entry corresponds to the tap it just issued (a native tap
// resolves once WDA dispatches the touch, not once the webview's click
// handler has necessarily run and recorded it).
const READ_CALIBRATION_TAPS_SCRIPT = `
  return window.${CALIBRATION_TAPS_MARKER} || [];
`;

const READ_VIEWPORT_STATE_SCRIPT = `
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    isScrolledToTop: document.documentElement.scrollTop === 0 && document.body.scrollTop === 0,
  };
`;

// Marks arguments[0] with a throwaway `aria-label` (WebKit reflects this
// into the native accessibility label) so it can be looked up unambiguously
// by `findNativeElementOrElements('accessibility id', uuid)`. Returns null
// for elements that are genuinely inaccessible (aria-hidden, invisible, or
// not yet painted) so the caller can fall through to coordinate-based
// tapping; otherwise returns what the element's `aria-label` was before, so
// it can be restored afterwards.
const MARK_ELEMENT_FOR_NATIVE_TAP_SCRIPT = `
  var el = arguments[0];
  var uuid = arguments[1];
  if (!el || el.getAttribute('aria-hidden') === 'true') {
    return null;
  }
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  var style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return null;
  }
  var hadAttribute = el.hasAttribute('aria-label');
  var original = hadAttribute ? el.getAttribute('aria-label') : null;
  el.setAttribute('aria-label', uuid);
  return {hadAttribute: hadAttribute, original: original};
`;

const RESTORE_ELEMENT_ARIA_LABEL_SCRIPT = `
  var el = arguments[0];
  var hadAttribute = arguments[1];
  var original = arguments[2];
  if (!el) {
    return;
  }
  if (hadAttribute) {
    el.setAttribute('aria-label', original);
  } else {
    el.removeAttribute('aria-label');
  }
`;

/**
 * Computes the affine transform (`native = offset + ratio * web`) that best
 * fits a set of native/web coordinate sample pairs, independently per axis.
 * With exactly 2 samples this reduces to the same 2-point calculation the
 * driver has always used; with more it's an ordinary least-squares fit,
 * which lets calibration become more robust in the future without changing
 * the shape of the result.
 *
 * Pure and driver-independent so it can be unit tested directly.
 *
 * @param samples - At least 2 native/web coordinate pairs
 * @throws {Error} If fewer than 2 samples are given, or the samples don't
 *   vary enough along an axis to fit a transform (e.g. all web x values equal)
 */
export function fitAffineTransform(samples: readonly CalibrationSample[]): CalibrationData {
  if (samples.length < 2) {
    throw new Error(
      `At least 2 calibration samples are required to fit a coordinates transform, got ${samples.length}`,
    );
  }

  const fitAxis = (nativeValues: number[], webValues: number[]): {offset: number; ratio: number} => {
    const n = webValues.length;
    const webMean = webValues.reduce((sum, v) => sum + v, 0) / n;
    const nativeMean = nativeValues.reduce((sum, v) => sum + v, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      const webDelta = webValues[i] - webMean;
      numerator += webDelta * (nativeValues[i] - nativeMean);
      denominator += webDelta * webDelta;
    }
    if (denominator === 0) {
      throw new Error('Cannot fit a coordinates transform: the calibration samples do not vary enough along this axis');
    }
    const ratio = numerator / denominator;
    return {offset: nativeMean - ratio * webMean, ratio};
  };

  const xFit = fitAxis(
    samples.map((s) => s.native.x),
    samples.map((s) => s.web.x),
  );
  const yFit = fitAxis(
    samples.map((s) => s.native.y),
    samples.map((s) => s.web.y),
  );

  return {
    offsetX: xFit.offset,
    offsetY: yFit.offset,
    pixelRatioX: xFit.ratio,
    pixelRatioY: yFit.ratio,
  };
}

/**
 * Builds the cache key `translateWebCoords` uses to decide whether a
 * previously fitted calibration transform is still valid. Rotating the
 * device, resizing the viewport (e.g. the on-screen keyboard appearing), or
 * scrolling away from the top of the page can all change how web
 * coordinates map to native ones, so any change to this signature should
 * invalidate the cache.
 *
 * Pure and driver-independent so it can be unit tested directly.
 */
export function viewportSignature(state: ViewportState): string {
  return `${state.orientation}:${state.innerWidth}x${state.innerHeight}:${state.isScrolledToTop ? 'top' : 'scrolled'}`;
}

/**
 * Finds the current native XCUIElementTypeWebView and returns its rect.
 * Used to pick native points to tap during calibration.
 *
 * A single attempt: this is only ever called from inside
 * {@linkcode performCalibration}'s own retry loop, so retrying here too
 * would just compound into an excessive worst-case number of attempts.
 */
async function findWebviewRect(this: XCUITestDriver): Promise<Rect> {
  let webview: Element | undefined | string;
  try {
    webview = await this.findNativeElementOrElements('class name', 'XCUIElementTypeWebView', false);
  } catch {}

  if (!webview) {
    throw new Error(`No WebView found. Unable to calibrate web coordinates for native web tap.`);
  }

  webview = util.unwrapElement(webview);
  return (await this.proxyCommand(`/element/${webview}/rect`, 'GET')) as Rect;
}

/**
 * Reads the signals that make up the current {@linkcode ViewportState} and
 * combines them with the current context into a cache key. The context is
 * included on top of what the plan's signature covers, because switching to
 * a different webview is itself a reason any previously fitted transform no
 * longer applies.
 */
async function computeViewportSignature(this: XCUITestDriver): Promise<string> {
  const {innerWidth, innerHeight, isScrolledToTop} = (await this.execute(READ_VIEWPORT_STATE_SCRIPT)) as {
    innerWidth: number;
    innerHeight: number;
    isScrolledToTop: boolean;
  };
  const orientation: ViewportState['orientation'] = innerHeight >= innerWidth ? 'PORTRAIT' : 'LANDSCAPE';
  return `${this.curContext ?? ''}::${viewportSignature({orientation, innerWidth, innerHeight, isScrolledToTop})}`;
}

/**
 * Fits a fresh web-to-native calibration transform by injecting a temporary,
 * full-viewport click-capturing overlay into the current DOM, tapping it
 * twice through WDA, and reading back the web coordinates each tap was
 * observed at. This never navigates away from the page under test, and
 * measures whatever chrome (or lack of it) is actually on screen right now,
 * so it works the same way for Safari and hybrid-app webviews alike.
 */
async function performCalibration(this: XCUITestDriver): Promise<CalibrationCacheEntry> {
  let entry: CalibrationCacheEntry | undefined;
  await retryInterval(CALIBRATION_RETRIES, CALIBRATION_RETRY_INTERVAL_MS, async () => {
    const rect = await findWebviewRect.call(this);
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;

    await this.execute(INJECT_CALIBRATION_OVERLAY_SCRIPT);
    try {
      const samples: CalibrationSample[] = [];
      for (const [i, sign] of [-1, 1].entries()) {
        const nativeX = centerX + sign * CALIBRATION_TAP_DELTA_PX;
        const nativeY = centerY + sign * CALIBRATION_TAP_DELTA_PX;
        await this.mobileTap(nativeX, nativeY);
        // Correlate by index rather than trusting "the last entry in the
        // array" to be this tap's: WDA's tap response can resolve before the
        // webview's own click handler has run and recorded it.
        const expectedCount = i + 1;
        const taps = (await retryInterval(
          CALIBRATION_TAP_READBACK_RETRIES,
          CALIBRATION_TAP_READBACK_INTERVAL_MS,
          async () => {
            const result = (await this.execute(READ_CALIBRATION_TAPS_SCRIPT)) as Position[];
            if (!Array.isArray(result) || result.length < expectedCount) {
              throw new Error('The calibration overlay has not observed this tap yet');
            }
            return result;
          },
        )) as Position[];
        const web = taps[expectedCount - 1];
        if (!web || !Number.isFinite(web.x) || !Number.isFinite(web.y)) {
          throw new Error('The calibration overlay did not observe the expected click event');
        }
        samples.push({native: {x: nativeX, y: nativeY}, web});
      }
      const data = fitAffineTransform(samples);
      const signature = await computeViewportSignature.call(this);
      entry = {signature, data};
    } finally {
      try {
        await this.execute(REMOVE_CALIBRATION_OVERLAY_SCRIPT);
      } catch (err) {
        // Don't let a cleanup hiccup mask a real error from the try block
        // above, or abort the retry loop on its own; the overlay-inject
        // script tears down and rebuilds from scratch regardless, so a
        // failed removal here doesn't corrupt the next attempt.
        this.log.debug(`Failed to remove the calibration overlay: ${toErrorMessage(err)}`);
      }
    }
  });
  return entry as CalibrationCacheEntry;
}

/**
 * Returns a cached web-to-native calibration transform if the webview's
 * orientation/size/scroll state hasn't changed since it was fitted,
 * otherwise transparently (re)calibrates. This is what makes calibration
 * automatic: callers never need to notice or handle staleness themselves.
 *
 * @param force - Recalibrate unconditionally, ignoring any cached entry
 */
async function getOrCreateWebviewCalibration(this: XCUITestDriver, force = false): Promise<CalibrationData> {
  if (!force) {
    const signature = await computeViewportSignature.call(this);
    if (this._webviewCalibrationCache?.signature === signature) {
      this.log.debug(`Reusing cached web-to-native calibration for signature '${signature}'`);
      return this._webviewCalibrationCache.data;
    }
  }

  this.log.debug('Fitting a new web-to-native coordinates calibration');
  // keep track of implicit wait, and set locally to 0
  // https://github.com/appium/appium/issues/14988
  const implicitWaitMs = this.implicitWaitMs;
  this.setImplicitWait(0);
  try {
    this._webviewCalibrationCache = await performCalibration.call(this);
  } finally {
    this.setImplicitWait(implicitWaitMs);
  }
  return this._webviewCalibrationCache.data;
}

/**
 * Attempts to tap a web element by marking it with a unique, throwaway
 * `aria-label` and looking that up as a native accessibility id. WebKit
 * reflects `aria-label` into the native accessibility label, so this
 * resolves to exactly one native element with no ambiguity heuristics,
 * including icon buttons, images, and elements with duplicate visible text.
 *
 * @param atomsElement - Atoms-compatible element to tap
 * @returns True if the native tap was successful, false otherwise
 */
async function tapWebElementNatively(this: XCUITestDriver, atomsElement: AtomsElement): Promise<boolean> {
  const uuid = util.uuidV4();
  let marker: {hadAttribute: boolean; original: string | null} | null = null;
  try {
    marker = (await this.executeAtom('execute_script', [MARK_ELEMENT_FOR_NATIVE_TAP_SCRIPT, [atomsElement, uuid]])) as {
      hadAttribute: boolean;
      original: string | null;
    } | null;
    if (!marker) {
      // element is genuinely inaccessible (aria-hidden, invisible, zero-size)
      return false;
    }

    const els = (await this.findNativeElementOrElements('accessibility id', uuid, true)) as Element[];
    if (els.length !== 1) {
      this.log.debug(`Expected to find exactly 1 native element with accessibility id '${uuid}', found ${els.length}`);
      return false;
    }

    // use tap because on iOS 11.2 and below `nativeClick` crashes WDA
    const rect = (await this.proxyCommand(`/element/${util.unwrapElement(els[0])}/rect`, 'GET')) as Rect;
    await this.mobileTap(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return true;
  } catch (err) {
    // any failure should fall through and trigger the more elaborate
    // method of clicking
    this.log.warn(`Error attempting to click: ${toErrorMessage(err)}`);
    return false;
  } finally {
    if (marker) {
      try {
        await this.executeAtom('execute_script', [
          RESTORE_ELEMENT_ARIA_LABEL_SCRIPT,
          [atomsElement, marker.hadAttribute, marker.original],
        ]);
      } catch (err) {
        this.log.debug(`Failed to restore the original 'aria-label' value: ${toErrorMessage(err)}`);
      }
    }
  }
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
 * @deprecated No longer used: coordinate translation is calibrated
 * automatically and no longer needs a device-type hint. Kept as a no-op only
 * for backward compatibility with existing callers.
 */
export async function getSafariIsIphone(this: XCUITestDriver): Promise<boolean> {
  return true;
}

/**
 * @deprecated No longer used: coordinate translation is calibrated
 * automatically and no longer needs the device's screen size. Kept as a
 * no-op only for backward compatibility with existing callers.
 */
export async function getSafariDeviceSize(this: XCUITestDriver): Promise<Size> {
  return {width: 0, height: 0};
}

/**
 * @deprecated No longer used: coordinate translation is calibrated
 * automatically and no longer needs a notch hint. Kept as a no-op only for
 * backward compatibility with existing callers.
 */
export async function getSafariIsNotched(this: XCUITestDriver): Promise<boolean> {
  return false;
}

/**
 * @deprecated No longer used: coordinate translation is calibrated
 * automatically instead of computing Safari-chrome offsets. Kept as a no-op
 * only for backward compatibility with existing callers.
 */
export async function getExtraTranslateWebCoordsOffset(
  this: XCUITestDriver,
  wvPos: {x: number; y: number},
  realDims: {w: number; h: number},
): Promise<void> {
  void wvPos;
  void realDims;
}

/**
 * @deprecated No longer used: coordinate translation is calibrated
 * automatically instead of computing a smart-app-banner offset. Kept as a
 * no-op only for backward compatibility with existing callers.
 */
export async function getExtraNativeWebTapOffset(
  this: XCUITestDriver,
  isIphone: boolean,
  bannerVisibility: string,
): Promise<number> {
  void isIphone;
  void bannerVisibility;
  return 0;
}

/**
 * Performs a native tap on a web element.
 *
 * Attempts to use a simple native tap first, falling back to coordinate-based tapping if needed.
 *
 * @param el - Element to tap
 */
export async function nativeWebTap(this: XCUITestDriver, el: Element | string): Promise<void> {
  const atomsElement = this.getAtomsElement(el);

  // if strict native tap, do not try to do it with WDA directly
  if (!this.settings.getSettings().nativeWebTapStrict && (await tapWebElementNatively.bind(this)(atomsElement))) {
    return;
  }
  this.log.warn('Unable to do simple native web tap. Attempting to convert coordinates');

  const [size, coordinates] = (await Promise.all([
    this.executeAtom('get_size', [atomsElement]),
    this.executeAtom('get_top_left_coordinates', [atomsElement]),
  ])) as [Size, Position];
  const {width, height} = size;
  const {x, y} = coordinates;
  await this.clickWebCoords(x + width / 2, y + height / 2);
}

/**
 * Translates web coordinates to native screen coordinates.
 *
 * Always uses a calibration transform, automatically (re)fitting one via
 * {@linkcode getOrCreateWebviewCalibration} whenever the cached one no
 * longer matches the current orientation/size/scroll state.
 *
 * @param x - X coordinate in web space
 * @param y - Y coordinate in web space
 * @returns Translated position in native coordinates
 * @throws {Error} If no WebView is found or if calibration fails
 */
export async function translateWebCoords(this: XCUITestDriver, x: number, y: number): Promise<Position> {
  this.log.debug(`Translating web coordinates (${JSON.stringify({x, y})}) to native coordinates`);

  const {offsetX, offsetY, pixelRatioX, pixelRatioY} = await getOrCreateWebviewCalibration.call(this);
  const cmd =
    '(function () {return {innerWidth: window.innerWidth, innerHeight: window.innerHeight, ' +
    'outerWidth: window.outerWidth, outerHeight: window.outerHeight}; })()';
  const wvDims = (await this.remote.execute(cmd)) as {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
  };
  // https://tripleodeon.com/2011/12/first-understand-your-screen/
  const shouldApplyPixelRatio = wvDims.innerWidth > wvDims.outerWidth || wvDims.innerHeight > wvDims.outerHeight;
  const newCoords = {
    x: offsetX + x * (shouldApplyPixelRatio ? pixelRatioX : 1),
    y: offsetY + y * (shouldApplyPixelRatio ? pixelRatioY : 1),
  };

  this.log.debug(`Converted web coords ${JSON.stringify({x, y})} into real coords ${JSON.stringify(newCoords)}`);
  return newCoords;
}

/**
 * Primes (or refreshes) the calibration transform that `translateWebCoords`
 * fits and applies automatically for every native web tap. Calibration
 * happens transparently as soon as it's needed, so calling this explicitly
 * is optional; it's useful mainly to warm the cache ahead of a
 * timing-sensitive interaction, or to force a fresh fit without waiting for
 * the viewport signature to change.
 *
 * Measures against the current page in place, without navigating away from
 * it, so it is safe to call without losing web app state, and works
 * identically for Safari and hybrid-app webviews.
 *
 * @returns Calibration data with offset and pixel ratio information
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function mobileCalibrateWebToRealCoordinatesTranslation(this: XCUITestDriver): Promise<CalibrationData> {
  requireWebContext(this, 'This API can only be called from a web context');

  const result = await getOrCreateWebviewCalibration.call(this, true);
  return {
    ...result,
    offsetX: Math.round(result.offsetX),
    offsetY: Math.round(result.offsetY),
  };
}
