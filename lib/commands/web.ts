import {setTimeout as delay} from 'node:timers/promises';

import type {Element, Cookie} from '@appium/types';
import type {AtomName} from 'appium-remote-debugger';
import {errors, isErrorType} from 'appium/driver.js';
import {timing, util} from 'appium/support.js';

import type {XCUITestDriver} from '../driver.js';
import {isEmpty, isPlainObject, toErrorMessage} from '../utils/index.js';
import {
  requireAutomationSessionActive,
  requireSimulator,
  requireWebContext,
  TimeoutError,
  withTimeout,
} from './helpers/index.js';
import type {AtomsElement} from './types.js';

const ATOM_WAIT_TIMEOUT_MS = 2 * 60000;
// This value must be greater than the alerts check interval in WDA:
// https://github.com/appium/WebDriverAgent/blob/8bc3135f021b529d916846477544f4b8ca890f59/WebDriverAgentLib/Utilities/FBAlertsMonitor.m#L17
const ATOM_INITIAL_WAIT_MS = 2100;
const OBSTRUCTING_ALERT_PRESENCE_CHECK_INTERVAL_MS = 500;

const ON_OBSTRUCTING_ALERT_EVENT = 'alert';
const ON_APP_CRASH_EVENT = 'app_crash';

/**
 * Sets the current web frame context.
 *
 * A cross-origin frame can be entered but not scripted, so entering verifies
 * the frame is actually usable and rolls back immediately if not, rather
 * than failing later on some unrelated command.
 *
 * @param frame - Frame identifier (number, string, or null to return to default content)
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 * @throws {errors.NoSuchFrameError} If the specified frame is not found
 * @throws {Error} If the frame (or one of its ancestors) has a different origin than the top-level page
 */
export async function setFrame(this: XCUITestDriver, frame: number | string | null): Promise<void> {
  requireWebContext(this);

  if (frame === null) {
    await this._webExecutionBackend.switchToDefaultContent();
    return;
  }
  await this._webExecutionBackend.switchToFrame(frame as number | Element | string);
}

/**
 * Switches to the immediate parent of the current frame.
 *
 * Has no atoms equivalent - only supported once an automation session is active.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If no automation session is active
 */
export async function switchToParentFrame(this: XCUITestDriver): Promise<void> {
  await requireAutomationSessionActive(this, 'Switching to the parent frame').switchToParentFrame();
}

/**
 * Gets the value of a CSS property for an element.
 *
 * @param propertyName - Name of the CSS property
 * @param el - Element to get the property from
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function getCssProperty(
  this: XCUITestDriver,
  propertyName: string,
  el: Element | string,
): Promise<string> {
  requireWebContext(this);

  return await this._webExecutionBackend.getCssValue(util.unwrapElement(el), propertyName);
}

/**
 * Submits the form that contains the specified element.
 *
 * @param el - The element ID or element object
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function submit(this: XCUITestDriver, el: string | Element): Promise<void> {
  requireWebContext(this);

  await this._webExecutionBackend.submit(util.unwrapElement(el));
}

/**
 * Refreshes the current page.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function refresh(this: XCUITestDriver): Promise<void> {
  requireWebContext(this);

  await this._webExecutionBackend.refresh();
}

/**
 * Gets the current page URL.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function getUrl(this: XCUITestDriver): Promise<string> {
  requireWebContext(this);

  return await this._webExecutionBackend.getCurrentUrl();
}

/**
 * Gets the current page title.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function title(this: XCUITestDriver): Promise<string> {
  requireWebContext(this);

  return await this._webExecutionBackend.getTitle();
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
  requireWebContext(this);

  return await this._webExecutionBackend.getCookies();
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
  requireWebContext(this);

  const clonedCookie = structuredClone(cookie);
  // if `path` field is not specified, Safari will not update cookies as expected; eg issue #1708
  if (!clonedCookie.path) {
    clonedCookie.path = '/';
  }
  await this._webExecutionBackend.addCookie(clonedCookie);
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
  requireWebContext(this);

  await this._webExecutionBackend.deleteCookie(cookieName);
}

/**
 * Deletes all cookies for the current page.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function deleteCookies(this: XCUITestDriver): Promise<void> {
  requireWebContext(this);

  await this._webExecutionBackend.deleteAllCookies();
}

/**
 * Caches a web element for later use.
 *
 * @param el - Element to cache
 * @returns The cached element wrapper
 */
export function cacheWebElement(this: XCUITestDriver, el: Element | string): Element | string {
  if (!isPlainObject(el)) {
    return el;
  }
  const elId = util.unwrapElement(el);
  if (!isValidElementIdentifier(elId)) {
    return el;
  }
  // In newer debugger releases element identifiers look like `:wdc:1628151649325`
  // We assume it is safe to use these to identify cached elements
  const cacheId = elId.includes(':') ? elId : util.uuidV4();
  this.webElementsCache.set(cacheId, elId);
  return util.wrapElement(cacheId);
}

/**
 * Recursively caches all web elements in a response object.
 *
 * The concrete shape of the result mirrors `response`, except that any embedded
 * atoms element gets replaced with its cached W3C element wrapper; callers should
 * assert the concrete shape they expect back.
 *
 * @param response - Response object that may contain web elements
 * @returns Response with cached element wrappers
 */
export function cacheWebElements(this: XCUITestDriver, response: unknown): unknown {
  const toCached = (v: unknown): unknown => (Array.isArray(v) || isPlainObject(v) ? this.cacheWebElements(v) : v);

  if (Array.isArray(response)) {
    return response.map(toCached);
  } else if (isPlainObject(response)) {
    const result = {...response, ...(this.cacheWebElement(response as unknown as Element) as Element)};
    return Object.entries(result).reduce(
      (acc, [key, value]) => {
        acc[key] = toCached(value);
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }
  return response;
}

/**
 * Executes a Selenium atom script in the current web context.
 *
 * @template T - Expected result type; defaults to `any` for callers that don't need it
 * @param atom - Name of the atom to execute
 * @param args - Arguments to pass to the atom
 * @param alwaysDefaultFrame - If true, always use the default frame instead of current frames
 */
export async function executeAtom<T = any>(
  this: XCUITestDriver,
  atom: AtomName,
  args: unknown[],
  alwaysDefaultFrame: boolean = false,
): Promise<T> {
  const frames = alwaysDefaultFrame === true ? [] : this.curWebFrames;
  const promise = this.remote.executeAtom(atom, args, frames);
  return await this.waitForAtom(promise);
}

/**
 * Executes a Selenium atom script asynchronously.
 *
 * @template T - Expected result type; defaults to `unknown` for callers that don't need it
 * @param atom - Name of the atom to execute
 * @param args - Arguments to pass to the atom
 */
export async function executeAtomAsync<T = unknown>(this: XCUITestDriver, atom: AtomName, args: unknown[]): Promise<T> {
  const promise = this.remote.executeAtomAsync(atom, args, this.curWebFrames);
  return await this.waitForAtom<T>(promise);
}

/**
 * Gets the atoms-compatible element representation.
 *
 * @template S - Element identifier type
 * @param elOrId - Element or element ID
 * @returns Atoms-compatible element object
 * @throws {errors.StaleElementReferenceError} If the element is not in the cache
 */
export function getAtomsElement<S extends string = string>(
  this: XCUITestDriver,
  elOrId: S | Element<S>,
): AtomsElement<S> {
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
export function convertElementsForAtoms(this: XCUITestDriver, args: readonly unknown[] = []): unknown[] {
  return args.map((arg) => {
    if (isElementLike(arg)) {
      try {
        return this.getAtomsElement(arg);
      } catch (err) {
        if (!isErrorType(err, errors.StaleElementReferenceError)) {
          throw err;
        }
      }
      return arg;
    }
    return Array.isArray(arg) ? this.convertElementsForAtoms(arg) : arg;
  });
}

/**
 * Extracts the element ID from an element object.
 *
 * @param element - Element object
 * @returns Element ID if found, undefined otherwise
 */
export function getElementId(element: unknown): string | undefined {
  return isElementLike(element) ? util.unwrapElement(element) : undefined;
}

/**
 * Checks if an object has an element ID (type guard).
 *
 * @param element - Object to check
 * @returns True if the object has an element ID
 */
export function hasElementId(element: unknown): element is Element {
  return isElementLike(element);
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
  many: true,
  ctx?: Element | string | null,
): Promise<Element[]>;
export async function findWebElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  many?: false,
  ctx?: Element | string | null,
): Promise<Element>;
export async function findWebElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  many?: boolean,
  ctx?: Element | string | null,
): Promise<Element | Element[]>;
export async function findWebElementOrElements(
  this: XCUITestDriver,
  strategy: string,
  selector: string,
  many?: boolean,
  ctx?: Element | string | null,
): Promise<Element | Element[]> {
  const contextElement: AtomsElement | null = ctx == null ? null : this.getAtomsElement(ctx);
  const atomName: AtomName = many ? 'find_elements' : 'find_element_fragment';
  let element: AtomsElement | AtomsElement[] | null = null;
  const doFind = async (): Promise<boolean> => {
    element = await this.executeAtom<AtomsElement | AtomsElement[] | null>(atomName, [
      strategy,
      selector,
      contextElement,
    ]);
    return !isEmpty(element);
  };
  try {
    await this.implicitWaitForCondition(doFind);
  } catch (err) {
    if (err instanceof Error && /Condition unmet/.test(err.message)) {
      // condition was not met setting res to empty array
      element = [];
    } else {
      throw err;
    }
  }

  if (many) {
    return this.cacheWebElements(element) as Element[];
  }
  if (isEmpty(element)) {
    throw new errors.NoSuchElementError();
  }
  return this.cacheWebElements(element) as Element;
}

/**
 * Checks if an alert is currently present.
 *
 * @returns True if an alert is present, false otherwise
 */
export async function checkForAlert(this: XCUITestDriver): Promise<boolean> {
  return typeof (await this.getAlertText()) === 'string';
}

/**
 * Waits for an atom promise to resolve, monitoring for alerts during execution.
 *
 * @template T - Type of the atom execution result
 * @param promise - Promise returned by atom execution
 * @returns The result of the atom execution
 * @throws {errors.UnexpectedAlertOpenError} If an alert appears during execution
 * @throws {errors.TimeoutError} If the atom execution times out
 */
export async function waitForAtom<T = unknown>(this: XCUITestDriver, promise: Promise<T>): Promise<T> {
  const timer = new timing.Timer().start();

  const atomWaitTimeoutMs =
    typeof this.opts.webviewAtomWaitTimeout === 'number' && this.opts.webviewAtomWaitTimeout > 0
      ? this.opts.webviewAtomWaitTimeout
      : ATOM_WAIT_TIMEOUT_MS;
  // need to check for alert while the atom is being executed.
  // so notify ourselves when it happens
  const timedAtomPromise = withTimeout(
    promise,
    atomWaitTimeoutMs,
    `The atom execution has timed out after ${atomWaitTimeoutMs}ms`,
  );
  const handlePromiseError = async (p: Promise<T>): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      this.log.debug(`Error received while executing atom: ${toErrorMessage(err)}`);
      throw err instanceof TimeoutError ? await generateAtomTimeoutError.bind(this)(timer) : err;
    }
  };
  // if the atom promise is fulfilled within ATOM_INITIAL_WAIT_MS
  // then we don't need to check for an alert presence
  let didTimedAtomPromiseSettle = false;
  const trackedTimedAtomPromise = (async (): Promise<T> => {
    try {
      return await timedAtomPromise;
    } finally {
      didTimedAtomPromiseSettle = true;
    }
  })();
  try {
    await withTimeout(trackedTimedAtomPromise, ATOM_INITIAL_WAIT_MS);
  } catch (err) {
    // Ignore the initial wait timeout and continue with alert monitoring.
    // Any atom promise rejection should still be handled and normalized below.
    if (!(err instanceof TimeoutError) || didTimedAtomPromiseSettle) {
      return await handlePromiseError(trackedTimedAtomPromise);
    }
  }
  if (didTimedAtomPromiseSettle) {
    return await handlePromiseError(trackedTimedAtomPromise);
  }

  // ...otherwise make sure there is no unexpected alert covering the element
  this._waitingAtoms.count++;

  let onAlertCallback: (() => void) | undefined;
  let onAppCrashCallback: ((err: unknown) => void) | undefined;
  try {
    startAlertMonitorIfNeeded.call(this);

    return await new Promise<T>((resolve, reject) => {
      onAlertCallback = () => reject(new errors.UnexpectedAlertOpenError());
      onAppCrashCallback = reject;
      this._waitingAtoms.alertNotifier.once(ON_OBSTRUCTING_ALERT_EVENT, onAlertCallback);
      this._waitingAtoms.alertNotifier.once(ON_APP_CRASH_EVENT, onAppCrashCallback);
      handlePromiseError(timedAtomPromise).then(resolve).catch(reject);
    });
  } finally {
    if (onAlertCallback) {
      this._waitingAtoms.alertNotifier.removeListener(ON_OBSTRUCTING_ALERT_EVENT, onAlertCallback);
    }
    if (onAppCrashCallback) {
      this._waitingAtoms.alertNotifier.removeListener(ON_APP_CRASH_EVENT, onAppCrashCallback);
    }
    this._waitingAtoms.count = Math.max(0, this._waitingAtoms.count - 1);
    if (this._waitingAtoms.count <= 0) {
      const monitorPromise = this._waitingAtoms.alertMonitor;
      this._waitingAtoms.alertMonitorAbortController?.abort();
      if (monitorPromise) {
        try {
          await monitorPromise;
        } catch {}
      }
    }
  }
}

/**
 * Performs browser navigation (back, forward, etc.) using history API.
 *
 * @param navType - Navigation type (e.g., 'back', 'forward')
 */
export async function mobileWebNav(this: XCUITestDriver, navType: string): Promise<void> {
  this.remote.allowNavigationWithoutReload = true;
  try {
    await this.executeAtom('execute_script', [`history.${navType}();`, null]);
  } finally {
    this.remote.allowNavigationWithoutReload = false;
  }
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
export async function mobileUpdateSafariPreferences(
  this: XCUITestDriver,
  preferences: Record<string, unknown>,
): Promise<void> {
  const simulator = requireSimulator(this, 'Updating Safari preferences');
  if (!isPlainObject(preferences)) {
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
async function generateAtomTimeoutError(
  this: XCUITestDriver,
  timer: timing.Timer,
): Promise<InstanceType<typeof errors.TimeoutError>> {
  let message =
    `The remote Safari debugger did not respond to the requested ` +
    `command after ${timer.getDuration().asMilliSeconds}ms. `;
  message += (await this._remote?.isJavascriptExecutionBlocked())
    ? `It appears that JavaScript execution is blocked, ` +
      `which could be caused by either a modal dialog obstructing the current page, ` +
      `or a JavaScript routine monopolizing the event loop.`
    : `However, the debugger still responds to JavaScript commands, ` +
      `which suggests that the provided atom script is taking too long to execute.`;
  if (this.opts.webviewAtomWaitTimeout === undefined) {
    message +=
      ` You may also consider adjusting the timeout by setting the ` + `'webviewAtomWaitTimeout' driver capability.`;
  }
  return new errors.TimeoutError(message);
}

/**
 * Starts the shared alert monitor when no instance is running (caller / waitForAtom side).
 */
function startAlertMonitorIfNeeded(this: XCUITestDriver): void {
  if (this._waitingAtoms.alertMonitor) {
    return;
  }
  let controller = this._waitingAtoms.alertMonitorAbortController;
  if (!controller || controller.signal.aborted) {
    controller = new AbortController();
    this._waitingAtoms.alertMonitorAbortController = controller;
  }
  this._waitingAtoms.alertMonitor = runAlertMonitorSession.call(this, controller);
}

/**
 * One monitor session: runs the poll loop, then tears down or hands off on the caller side.
 */
async function runAlertMonitorSession(this: XCUITestDriver, abortController: AbortController): Promise<void> {
  try {
    await alertMonitorLoop.call(this, abortController);
  } finally {
    if (this._waitingAtoms.count <= 0) {
      this._waitingAtoms.count = 0;
      this._waitingAtoms.alertMonitor = undefined;
      if (this._waitingAtoms.alertMonitorAbortController === abortController) {
        this._waitingAtoms.alertMonitorAbortController = undefined;
      }
    } else {
      // A new atom started while this monitor was winding down.
      let nextController = this._waitingAtoms.alertMonitorAbortController;
      if (!nextController || nextController.signal.aborted) {
        nextController = new AbortController();
        this._waitingAtoms.alertMonitorAbortController = nextController;
      }
      this._waitingAtoms.alertMonitor = runAlertMonitorSession.call(this, nextController);
    }
  }
}

/** Polls for obstructing alerts while there are waiting atoms. */
async function alertMonitorLoop(this: XCUITestDriver, abortController: AbortController): Promise<void> {
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
    try {
      await delay(OBSTRUCTING_ALERT_PRESENCE_CHECK_INTERVAL_MS, undefined, {
        signal: abortController.signal,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        throw err;
      }
      break;
    }
  }
}

/**
 * Checks whether a value looks like an atoms/W3C element wrapper.
 *
 * @param element - Value to check
 * @returns True if the value has an element ID
 */
function isElementLike(element: unknown): element is Element {
  if (!isPlainObject(element)) {
    return false;
  }
  const unwrapped: unknown = util.unwrapElement(element as unknown as Element);
  return unwrapped !== element;
}

/**
 * Validates if a value is a valid element identifier.
 *
 * @param id - Value to validate
 * @returns True if the value is a valid element identifier
 */
function isValidElementIdentifier(id: unknown): boolean {
  if (typeof id !== 'string' && typeof id !== 'number') {
    return false;
  }
  if (typeof id === 'string' && isEmpty(id)) {
    return false;
  }
  if (typeof id === 'number' && isNaN(id)) {
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
export function createJSCookie(
  key: string,
  value: string,
  options: {
    expires?: string;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
  } = {},
): string {
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
