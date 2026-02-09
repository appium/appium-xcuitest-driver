import {createRemoteDebugger, RemoteDebugger} from 'appium-remote-debugger';
import {errors, isErrorType} from 'appium/driver';
import {util, timing} from 'appium/support';
import {IOSPerformanceLog} from '../device/log/ios-performance-log';
import _ from 'lodash';
import { NATIVE_WIN } from '../utils';
import {
  makeContextUpdatedEvent,
  makeObsoleteContextUpdatedEvent,
} from './bidi/models';
import { BIDI_EVENT_NAME } from './bidi/constants';
import { assignBiDiLogListener } from './log';
import type {XCUITestDriver} from '../driver';
import type {Page} from '../types';
import type {ViewContext, FullContext, PageChangeNotification} from './types';
import type {Simulator} from 'appium-ios-simulator';

const WEBVIEW_WIN = 'WEBVIEW';
const WEBVIEW_BASE = `${WEBVIEW_WIN}_`;
const DEFAULT_REMOTE_DEBUGGER_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_LIST_WEB_FRAMES_RETRIES = 20;
const DEFAULT_NATIVE_WINDOW_HANDLE = '1';


/**
 * Retrieves the list of available contexts and their associated views.
 *
 * @param useUrl - Whether to filter webviews by URL
 */
export async function getContextsAndViews(this: XCUITestDriver, useUrl: boolean = true): Promise<ViewContext[]> {
  this.log.debug('Retrieving contexts and views');
  const webviews = await this.listWebFrames(useUrl);
  const ctxs: ViewContext[] = [{id: NATIVE_WIN, view: {}}];
  this.contexts = [NATIVE_WIN];
  for (const view of webviews) {
    ctxs.push({id: `${WEBVIEW_BASE}${view.id}`, view});
    this.contexts.push(view.id.toString());
  }
  return ctxs;
}

/**
 * @deprecated This method is not used anywhere and will be removed in the future
 */
export function useNewSafari(this: XCUITestDriver): boolean {
  return this.isSimulator() && this.isSafari();
}

/**
 * Activates the most recently available webview context.
 *
 * @throws {Error} If no webview is available or if the remote debugger cannot connect
 */
export async function activateRecentWebview(this: XCUITestDriver): Promise<void> {
  this.log.debug('Activating a recent webview');
  const timer = new timing.Timer().start();
  const contextId = await this.getRecentWebviewContextId(/.*/, /.*/);
  if (contextId) {
    this.log.info(`Picking webview '${contextId}' after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    await this.setContext(contextId);
    return;
  }
  const appDict = this.remote.appDict;
  const errSuffix = `Make sure your web application is debuggable ` +
    `and could be inspected in Safari Web Inspector.`;
  if (_.isEmpty(appDict)) {
    throw new Error(
      `The remote debugger did not return any connected web applications after ` +
      `${timer.getDuration().asMilliSeconds.toFixed(0)}ms. ` +
      `${errSuffix} ` +
      `You may try to change the 'webviewConnectTimeout' capability value to ` +
      `customize the retrieval timeout.`
    );
  }
  const errSuffix2 = `${errSuffix} You may try to change the 'webviewConnectRetries' ` +
    `capability value to customize the amount of pages retrieval retries.`;
  const appsWithPages = _.values(appDict).filter(({pageArray}) => !_.isEmpty(pageArray));
  if (appsWithPages.length > 0) {
    throw new Error(
      `The remote debugger returned ${util.pluralize('web application', appsWithPages.length, true)} ` +
      `with pages after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms, ` +
      `although none of them matched our page search criteria. ${errSuffix2}`
    );
  } else {
    throw new Error(
      `The remote debugger returned ${util.pluralize('web application', _.size(appDict), true)}, ` +
      `but none of them had pages after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms. ` +
      `${errSuffix2} Also, in rare cases the device restart or device OS upgrade may fix this ` +
      `issue if none of the above advices helps.`
    );
  }
}

/**
 * Lists all available web frames (pages) from the remote debugger.
 *
 * @param useUrl - Whether to filter pages by the current URL
 */
export async function listWebFrames(this: XCUITestDriver, useUrl: boolean = true): Promise<Page[]> {
  const shouldFilterByUrl = useUrl && !this.isRealDevice() && !!this.getCurrentUrl();
  this.log.debug(
    `Selecting by url: ${shouldFilterByUrl}` +
    (shouldFilterByUrl ? ` (expected url: '${this.getCurrentUrl()}')` : '')
  );

  if (!this._remote) {
    await this.connectToRemoteDebugger();
  }
  const doListPages = async (retries: number): Promise<Page[]> => {
    try {
      const pageArray = await this.remote.selectApp(
        shouldFilterByUrl ? this.getCurrentUrl() : undefined,
        retries,
        this.opts.ignoreAboutBlankUrl,
      );
      if (_.isEmpty(pageArray)) {
        // we have no web frames, but continue anyway
        this.log.debug(`No web frames found after ${util.pluralize('retry', retries, true)}`);
      }
      return pageArray;
    } catch (err: any) {
      this.log.debug(
        `No available web pages after ${util.pluralize('retry', retries, true)}: ${err.message}`
      );
      return [];
    }
  };

  const maxRetriesCount = _.isInteger(this.opts.webviewConnectRetries)
    ? Math.max(this.opts.webviewConnectRetries as number, 1)
    : DEFAULT_LIST_WEB_FRAMES_RETRIES;
  this.log.debug(
    `About to select a web application with ${util.pluralize('retry', maxRetriesCount, true)} ` +
    `and 500ms interval between each retry. Consider customizing the value of 'webviewConnectRetries' ` +
    `capability to change the amount of retries.`
  );
  return await doListPages(maxRetriesCount);
}

/**
 * Establishes a connection to the remote debugger and sets up event listeners.
 */
export async function connectToRemoteDebugger(this: XCUITestDriver): Promise<void> {
  this._remote = await this.getNewRemoteDebugger();

  this.remote.on(RemoteDebugger.EVENT_PAGE_CHANGE, this.onPageChange.bind(this));
  this.remote.on(RemoteDebugger.EVENT_FRAMES_DETACHED, () => {
    if (!_.isEmpty(this.curWebFrames)) {
      const curWebFrames = this.curWebFrames;
      this.log.debug(
        `Clearing ${util.pluralize('frame', curWebFrames.length, true)}: ${curWebFrames.join(
          ', ',
        )}`,
      );
    }
    this.curWebFrames = [];
  });

  const timeoutMs = this.opts.webviewConnectTimeout ?? DEFAULT_REMOTE_DEBUGGER_CONNECT_TIMEOUT_MS;
  const apps = await this.remote.connect(timeoutMs);
  if (_.isEmpty(apps)) {
    this.log.info(
      `The remote debugger did not report any active web applications within ${timeoutMs}ms timeout. ` +
      `Consider increasing the value of 'webviewConnectTimeout' capability to wait longer ` +
      `on slower devices.`
    );
  }
}

/**
 * Retrieves the list of available contexts.
 *
 * The list includes extended context information, like URLs and page names.
 * This is different from the standard `getContexts` API, because the latter
 * only has web view names without any additional information.
 *
 * @remarks In situations where multiple web views are available at once, the
 * client code would have to connect to each of them in order to detect the
 * one which needs to be interacted with. This extra effort is not needed with
 * the information provided by this extension.
 *
 * @param waitForWebviewMs - The period to poll for available webview(s) (in ms)
 * @returns The list of available context objects along with their properties.
 */
export async function mobileGetContexts(this: XCUITestDriver, waitForWebviewMs: number = 0): Promise<FullContext[]> {
  // make sure it is a number, so the duration check works properly
  if (!_.isNumber(waitForWebviewMs)) {
    waitForWebviewMs = parseInt(String(waitForWebviewMs), 10);
    if (isNaN(waitForWebviewMs)) {
      waitForWebviewMs = 0;
    }
  }

  const curOpt = this.opts.fullContextList;
  this.opts.fullContextList = true;

  const timer = new timing.Timer().start();
  try {
    let contexts: FullContext[];
    do {
      contexts = await this.getContexts() as FullContext[];

      if (contexts.length >= 2) {
        this.log.debug(
          `Found webview context after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
        );
        return contexts;
      }
      this.log.debug(`No webviews found in ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    } while (timer.getDuration().asMilliSeconds < waitForWebviewMs);
    return contexts;
  } finally {
    // reset the option so there are no side effects
    this.opts.fullContextList = curOpt;
  }
}

/**
 * Handles page change notifications from the remote debugger.
 *
 * Updates the current context when new pages are detected or when pages are closed.
 *
 * @param pageChangeNotification - The notification containing page array and app ID
 */
export async function onPageChange(this: XCUITestDriver, pageChangeNotification: PageChangeNotification): Promise<void> {
  this.log.debug(
    `Remote debugger notified us of a new page listing: ${JSON.stringify(
      pageChangeNotification,
    )}`,
  );
  if (this.selectingNewPage) {
    this.log.debug('We are in the middle of selecting a page, ignoring');
    return;
  }
  if (!this._remote?.isConnected) {
    this.log.debug('We have not yet connected, ignoring');
    return;
  }

  const {appIdKey, pageArray} = pageChangeNotification;

  const newIds: string[] = [];
  const newPages: string[] = [];
  let keyId: string | null = null;
  for (const page of pageArray) {
    const id = page.id.toString();
    newIds.push(id);
    if (page.isKey) {
      keyId = id;
    }
    const contextId = `${appIdKey}.${id}`;

    // add if this is a new page
    if (!_.includes(this.contexts, contextId)) {
      if (isUrlIgnored(page.url, this.opts.safariIgnoreWebHostnames)) {
        this.log.info(
          `Not tracking '${page.url}' page because it is blacklisted. ` +
            `'safariIgnoreWebHostnames'=${this.opts.safariIgnoreWebHostnames}`,
        );
      } else {
        newPages.push(id);
        this.contexts.push(contextId);
      }
    }
  }

  if (!keyId) {
    // if there is no key id, pull the first id from the page array and use that
    // as a stand in
    this.log.debug('No key id found. Choosing first id from page array');
    keyId = newIds[0] || null;
  }

  if (!util.hasValue(this.curContext)) {
    this.log.debug('We do not appear to have window set yet, ignoring');
    return;
  }
  const [curAppIdKey, curPageIdKey] = this.curContext.split('.');
  if (curAppIdKey !== appIdKey) {
    this.log.debug('Page change not referring to currently selected app, ignoring.');
    return;
  }

  let newPage: string | null = null;
  if (newPages.length) {
    newPage = _.last(newPages) as string;
    this.log.debug(`We have new pages, selecting page '${newPage}'`);
  } else if (!_.includes(newIds, curPageIdKey)) {
    this.log.debug(
      'New page listing from remote debugger does not contain ' +
        'current window; assuming it is closed',
    );
    if (!util.hasValue(keyId)) {
      this.log.error(
        'Do not have our current window anymore, and there ' +
          'are not any more to load! Doing nothing...',
      );
      this.setCurrentUrl(null);
      return;
    }

    this.log.debug(`Debugger already selected page '${keyId}', ` + `confirming that choice.`);
    this.curContext = `${appIdKey}.${keyId}`;
    newPage = keyId;
  } else {
    // at this point, there are no new pages, and the current page still exists
    this.log.debug('New page listing is same as old, doing nothing');
  }

  // make sure that the page listing isn't indicating a redirect
  if (util.hasValue(this.curContext)) {
    const currentPageId = parseInt(String(_.last(this.curContext.split('.'))), 10);
    const page = _.find(pageArray, (p) => parseInt(String(p.id), 10) === currentPageId);
    if (page && page.url !== this.getCurrentUrl()) {
      this.log.debug(`Redirected from '${this.getCurrentUrl()}' to '${page.url}'`);
      this.setCurrentUrl(page.url);
    }
  }

  if (util.hasValue(newPage)) {
    this.selectingNewPage = true;
    const oldContext = this.curContext;
    this.curContext = `${appIdKey}.${newPage}`;
    try {
      await this.remote.selectPage(appIdKey, parseInt(newPage, 10));
      await notifyBiDiContextChange.bind(this)();
    } catch (e: any) {
      this.log.warn(`Failed to select page: ${e.message}`);
      this.curContext = oldContext;
    } finally {
      this.selectingNewPage = false;
    }
  }
}

/**
 * Disconnects from the remote debugger and cleans up context state.
 */
export async function stopRemote(this: XCUITestDriver): Promise<void> {
  if (!this._remote) {
    return;
  }

  try {
    await this.remote.disconnect();
    this.curContext = null;
    try {
      await notifyBiDiContextChange.bind(this)();
    } catch (err) {
      this.log.warn(`Failed to notify BiDi context change: ${err.message}`);
    }
  } finally {
    this.curWebFrames = [];
    this._remote = null;
  }
}

/**
 * Sets the current URL for the active webview context.
 *
 * @param url - The URL to set, or null to clear
 */
export function setCurrentUrl(this: XCUITestDriver, url: string | null): void {
  this._currentUrl = url;
}

/**
 * Gets the current URL for the active webview context.
 *
 * @returns The current URL, or undefined/null if not set
 */
export function getCurrentUrl(this: XCUITestDriver): string | undefined | null {
  return this._currentUrl;
}

/**
 * Finds the most recent webview context ID matching the given title or URL patterns.
 *
 * @param titleRegExp - Regular expression to match against page titles
 * @param urlRegExp - Regular expression to match against page URLs
 * @returns The matching context ID, or undefined if no match is found
 * @throws {errors.InvalidArgumentError} If neither regex is provided
 */
export async function getRecentWebviewContextId(
  this: XCUITestDriver,
  titleRegExp: RegExp,
  urlRegExp: RegExp,
): Promise<string | undefined> {
  if (!_.isRegExp(titleRegExp) && !_.isRegExp(urlRegExp)) {
    throw new errors.InvalidArgumentError(
      'A regular expression for either web view title or url must be provided',
    );
  }

  const currentUrl = this.getCurrentUrl();
  const contexts = _.filter(await this.getContextsAndViews(false), 'view');
  // first try to match by current url
  if (currentUrl) {
    const ctx = contexts.find(({view}) => (view?.url || '') === currentUrl);
    if (ctx) {
      return ctx.id;
    }
  }
  // if not, try to match by regular expression
  return contexts.find(
    ({view}) =>
      (view?.title && titleRegExp?.test(view.title)) || (view?.url && urlRegExp?.test(view.url)),
  )?.id;
}

/**
 * Checks if the current context is a web context (not native).
 *
 * @returns True if currently in a web context
 */
export function isWebContext(this: XCUITestDriver): boolean {
  return !!this.curContext && this.curContext !== NATIVE_WIN;
}

/**
 * Checks if the current context is a webview.
 *
 * This is an alias for {@linkcode isWebContext}.
 *
 * @returns True if currently in a webview context
 */
export function isWebview(this: XCUITestDriver): boolean {
  return this.isWebContext();
}

/**
 * Creates a new remote debugger instance configured for the current device.
 *
 * @returns A configured RemoteDebugger instance
 */
export async function getNewRemoteDebugger(this: XCUITestDriver): Promise<RemoteDebugger> {
  const isRealDevice = this.isRealDevice();
  const socketPath = isRealDevice
    ? undefined
    : (await (this.device as Simulator).getWebInspectorSocket() ?? undefined);

  const baseOpts = {
    bundleId: this.opts.bundleId,
    additionalBundleIds: this.opts.additionalWebviewBundleIds as string[] | undefined,
    isSafari: this.isSafari(),
    includeSafari: this.opts.includeSafariInWebviews,
    pageLoadMs: this.pageLoadMs,
    platformVersion: this.opts.platformVersion,
    socketPath,
    remoteDebugProxy: this.opts.remoteDebugProxy,
    garbageCollectOnExecute: util.hasValue(this.opts.safariGarbageCollect)
      ? !!this.opts.safariGarbageCollect
      : false,
    logAllCommunication: this.opts.safariLogAllCommunication,
    logAllCommunicationHexDump: this.opts.safariLogAllCommunicationHexDump,
    socketChunkSize: this.opts.safariSocketChunkSize,
    webInspectorMaxFrameLength: this.opts.safariWebInspectorMaxFrameLength,
    pageLoadStrategy: this.caps.pageLoadStrategy,
  };

  return isRealDevice
    ? createRemoteDebugger({...baseOpts, udid: this.opts.udid as string}, true)
    : createRemoteDebugger(baseOpts, false);
  }
  return createRemoteDebugger(baseOpts, false);
}

/**
 * Gets the identifier of the current context.
 *
 * @returns The context identifier (e.g., 'NATIVE_APP' or 'WEBVIEW_xxx')
 */
export async function getCurrentContext(this: XCUITestDriver): Promise<string> {
  if (this.curContext && this.curContext !== NATIVE_WIN) {
    return `${WEBVIEW_BASE}${this.curContext}`;
  }
  return NATIVE_WIN;
}

/**
 * Switches to the specified context (native or webview).
 *
 * @param name - The name of context to set. Can be 'NATIVE_APP', 'WEBVIEW_xxx', or null
 * @param callback - The callback (not used, kept for compatibility)
 * @param skipReadyCheck - Whether to skip waiting for the new context to be ready
 * @throws {errors.NoSuchContextError} If the specified context does not exist
 */
export async function setContext(
  this: XCUITestDriver,
  name: string | {id: string} | null,
  callback?: any,
  skipReadyCheck: boolean = false,
): Promise<void> {
  function alreadyInContext(desired: string | null, current: string | null): boolean {
      return (
        desired === current ||
        (desired === null && current === NATIVE_WIN) ||
        (desired === NATIVE_WIN && current === null)
      );
    }
    function isNativeContext(context: string | null): boolean {
      return context === NATIVE_WIN || context === null;
    }

    // allow the full context list to be passed in
    const strName = String(typeof name === 'object' && name && 'id' in name ? name.id : name);

    this.log.debug(
      `Attempting to set context to '${strName || NATIVE_WIN}' from '${
        this.curContext ? this.curContext : NATIVE_WIN
      }'`,
    );

    if (
      alreadyInContext(strName, this.curContext) ||
      alreadyInContext(_.replace(strName, WEBVIEW_BASE, ''), this.curContext)
    ) {
      // already in the named context, no need to do anything
      this.log.debug(`Already in '${strName || NATIVE_WIN}' context. Doing nothing.`);
      return;
    }
    if (isNativeContext(strName)) {
      // switching into the native context
      this.curContext = null;
      await notifyBiDiContextChange.bind(this)();
      return;
    }

    // switching into a webview context

    // if contexts have not already been retrieved, get them
    if (_.isUndefined(this.contexts)) {
      await this.getContexts();
    }

    let contextId = _.replace(strName, WEBVIEW_BASE, '');
    if (contextId === '') {
      // allow user to pass in "WEBVIEW" without an index
      // the second context will be the first webview as
      // the first is always NATIVE_APP
      contextId = (this.contexts as string[])[1];
    }
    if (!_.includes(this.contexts, contextId)) {
      throw new errors.NoSuchContextError();
    }

    const oldContext = this.curContext;
    this.curContext = this.curWindowHandle = contextId;

    // `contextId` will be in the form of `appId.pageId` in this case
    const [appIdKey, pageIdKey] = _.map(contextId.split('.'), (id) => parseInt(id, 10));
    try {
      this.selectingNewPage = true;
      await this.remote.selectPage(appIdKey, pageIdKey, skipReadyCheck);
      await notifyBiDiContextChange.bind(this)();
    } catch (err) {
      this.curContext = this.curWindowHandle = oldContext;
      throw err;
    } finally {
      this.selectingNewPage = false;
    }

    // attempt to start performance logging, if requested
    if (this.opts.enablePerformanceLogging && this._remote) {
      const context = this.curContext;
      this.log.debug(`Starting performance log on '${context}'`);
      [this.logs.performance,] = assignBiDiLogListener.bind(this)(
        new IOSPerformanceLog({
          remoteDebugger: this.remote,
          log: this.log,
        }), {
          type: 'performance',
          context,
        }
      );
      await this.logs.performance?.startCapture();
    }

    // start safari logging if the logs handlers are active
    if (name && name !== NATIVE_WIN && this.logs) {
      if (this.logs.safariConsole) {
        this.remote.startConsole(
          this.logs.safariConsole.onConsoleLogEvent.bind(this.logs.safariConsole),
        );
      }
      if (this.logs.safariNetwork) {
        this.remote.startNetwork(
          this.logs.safariNetwork.onNetworkEvent.bind(this.logs.safariNetwork),
        );
      }
    }
  }

/**
 * Gets the list of available contexts.
 *
 * The format depends on the `fullContextList` option:
 * - If enabled, returns full context objects with title, URL, and bundleId
 * - If disabled, returns simple context ID strings
 *
 * @returns Array of context IDs or full context objects
 */
export async function getContexts(this: XCUITestDriver): Promise<string[] | FullContext[]> {
  this.log.debug('Getting list of available contexts');
  const contexts = await this.getContextsAndViews(false);

  if (this.opts.fullContextList) {
    return contexts.map((context) => ({
      id: context.id.toString(),
      title: context.view?.title,
      url: context.view?.url,
      bundleId: context.view?.bundleId,
    })) as FullContext[];
  }
  return contexts.map((context) => context.id.toString());
}

/**
 * Sets the current window (context) in a web context.
 *
 * This is a wrapper around {@linkcode setContext} that translates errors appropriately.
 *
 * @param name - The window/context name to switch to
 * @param skipReadyCheck - Whether to skip waiting for the window to be ready
 * @throws {errors.NoSuchWindowError} If the window does not exist
 */
export async function setWindow(
  this: XCUITestDriver,
  name: string,
  skipReadyCheck?: boolean,
): Promise<void> {
  if (!this.isWebContext()) {
    // https://github.com/appium/appium/issues/20710
    return;
  }
  try {
    await this.setContext(name, _.noop, skipReadyCheck);
  } catch (err) {
    // translate the error in terms of windows
    throw isErrorType(err, errors.NoSuchContextError) ? new errors.NoSuchWindowError() : err;
  }
}

/**
 * Gets the handle of the current window.
 *
 * In native context, returns a default handle. In web context, returns the current context ID.
 *
 * @returns The window handle
 * @throws {errors.InvalidContextError} If not in a valid context
 */
export async function getWindowHandle(this: XCUITestDriver): Promise<string> {
  if (!this.isWebContext()) {
    // https://github.com/appium/appium/issues/20710
    return DEFAULT_NATIVE_WINDOW_HANDLE;
  }
  if (!this.curContext) {
    throw new errors.InvalidContextError();
  }
  this.log.debug(`Getting current window handle`);
  return this.curContext;
}

/**
 * Gets the list of all available window handles.
 *
 * In native context, returns a single default handle. In web context, returns all webview handles.
 *
 * @returns Array of window handle strings
 */
export async function getWindowHandles(this: XCUITestDriver): Promise<string[]> {
  if (!this.isWebContext()) {
    // https://github.com/appium/appium/issues/20710
    return [DEFAULT_NATIVE_WINDOW_HANDLE];
  }
  this.log.debug('Getting list of available window handles');
  const contexts = await this.getContextsAndViews(false);
  return (
    contexts
      // get rid of the native app context
      .filter((context) => context.id !== NATIVE_WIN)
      // get the `app.id` format expected
      .map((context) =>
        // This is non-nullable because the `FullContext` having `id` `NATIVE_WIN`
        // _looks like_ the only with an empty view.
        context.view?.id?.toString() ?? ''
    )
  );
}

/**
 * Checks if a URL is blacklisted in the 'safariIgnoreWebHostnames' capability.
 *
 * @param url - The URL to check
 * @param safariIgnoreWebHostnames - Comma-separated list of hostnames to ignore
 * @returns True if the URL should be ignored
 */
function isUrlIgnored(url: string, safariIgnoreWebHostnames?: string): boolean {
  if (!safariIgnoreWebHostnames || _.isEmpty(safariIgnoreWebHostnames)) {
    return false;
  }

  const ignoredHosts = safariIgnoreWebHostnames
    .split(',')
    .map((b) => b.trim())
    .filter((b) => !_.isEmpty(b));
  for (const ignoredHost of ignoredHosts) {
    if (ignoredHost === 'about:blank' && url === 'about:blank') {
      return true;
    } else {
      try {
        const hostname = new URL(url).hostname;
        if (hostname === ignoredHost) {
          return true;
        }
      } catch {
        // do nothing if invalid URL
      }
    }
  }
  return false;
}

/**
 * Notifies BiDi clients about context changes.
 *
 * @see https://github.com/appium/appium/issues/20741
 */
export async function notifyBiDiContextChange(this: XCUITestDriver): Promise<void> {
  const name = await this.getCurrentContext();
  this.eventEmitter.emit(BIDI_EVENT_NAME, makeContextUpdatedEvent(name));
  this.eventEmitter.emit(BIDI_EVENT_NAME, makeObsoleteContextUpdatedEvent(name));
}

