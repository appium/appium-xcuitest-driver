import {createRemoteDebugger, RemoteDebugger} from 'appium-remote-debugger';
import {errors, isErrorType} from 'appium/driver';
import {util, timing} from 'appium/support';
import { waitForCondition } from 'asyncbox';
import IOSPerformanceLog from '../device-log/ios-performance-log';
import _ from 'lodash';

const NATIVE_WIN = 'NATIVE_APP';
const WEBVIEW_WIN = 'WEBVIEW';
const WEBVIEW_BASE = `${WEBVIEW_WIN}_`;
const RECENT_WEBVIEW_DETECTION_TIMEOUT_MS = 7000;

/**
 * Type guard for a non-empty array.
 *
 * @remarks Does not support subclasses of `Array` nor tuples.
 * @template T
 * @param {T[]} [value]
 * @returns {value is [T, ...T[]]}
 */
function isNonEmptyArray(value) {
  return Boolean(value?.length);
}

const extensions = {
  /**
   * @this {XCUITestDriver}
   */
  async getContextsAndViews(useUrl = true) {
    this.log.debug('Retrieving contexts and views');
    let webviews = await this.listWebFrames(useUrl);

    /**
     * @type {[import('./types').ViewContext<typeof NATIVE_WIN>]}
     */
    let ctxs = [{id: NATIVE_WIN, view: {}}];
    this.contexts = [NATIVE_WIN];
    for (const view of webviews) {
      ctxs.push({id: `${WEBVIEW_BASE}${view.id}`, view});
      this.contexts.push(view.id.toString());
    }
    return ctxs;
  },

  /**
   * Right now we don't necessarily wait for webview
   * and frame to load, which leads to race conditions and flakiness,
   * let's see if we can transition to something better
   * @this {XCUITestDriver}
   */
  useNewSafari() {
    return this.isSimulator() && this.isSafari();
  },

  /**
   * @this {XCUITestDriver}
   */
  async activateRecentWebview() {
    this.log.debug('Activating a recent webview');
    const timer = new timing.Timer().start();
    const waitMs = this.opts.webviewConnectTimeout || RECENT_WEBVIEW_DETECTION_TIMEOUT_MS;
    /** @type {Error|null} */
    let lastError = null;
    try {
      await waitForCondition(async () => {
        /** @type {string|undefined} */
        let contextId;
        try {
          contextId = await this.getRecentWebviewContextId(/.*/, /.*/);
        } catch (err) {
          lastError = err;
          this.log.debug(err.message);
          return false;
        }
        if (contextId) {
          this.log.info(`Picking webview '${contextId}' after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
          await this.setContext(contextId);
          await (/** @type {RemoteDebugger} */ (this.remote)).cancelPageLoad();
          return true;
        }

        this.log.info('Could not find any webviews yet, retrying');
        return false;
      }, {
        waitMs,
        intervalMs: 500,
      });
    } catch (e) {
      const elapsedMs = timer.getDuration().asMilliSeconds;
      if (elapsedMs >= waitMs) {
        if (lastError) {
          this.log.debug((/** @type {Error} */ (lastError)).stack);
        }
        // no webview was found
        throw new Error(
          `No webview has been detected after ${elapsedMs.toFixed(0)}ms. ` +
          `You may try to change the 'webviewConnectTimeout' capability value to modify the timeout.`
        );
      } else {
        throw e;
      }
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  async listWebFrames(useUrl = true) {
    useUrl = useUrl && !this.isRealDevice() && !!this.getCurrentUrl();
    this.log.debug(
      `Selecting by url: ${useUrl}${useUrl ? ` (expected url: '${this.getCurrentUrl()}')` : ''}`,
    );

    if (!this.remote) {
      await this.connectToRemoteDebugger();
      // @ts-ignore TS does not understand property mutation
      if (!this.remote.appIdKey) {
        // @ts-ignore TS does not understand property mutation
        await this.remote.setConnectionKey();
      }
    }
    const getWebviewPages = async () => {
      try {
        return await (/** @type {RemoteDebugger} */ (this.remote)).selectApp(
          useUrl ? this.getCurrentUrl() : undefined,
          this.opts.webviewConnectRetries,
          this.opts.ignoreAboutBlankUrl,
        );
      } catch (err) {
        this.log.debug(`No available web pages: ${err.message}`);
        return [];
      }
    };
    const pageArray = await getWebviewPages();
    if (_.isEmpty(pageArray)) {
      // we have no web frames, but continue anyway
      this.log.debug('No web frames found.');
    }
    return pageArray;
  },
  /**
   * @this {XCUITestDriver}
   */
  async connectToRemoteDebugger() {
    this.remote = await this.getNewRemoteDebugger();

    // @ts-ignore static is fine
    this.remote.on(RemoteDebugger.EVENT_PAGE_CHANGE, this.onPageChange.bind(this));
    // @ts-ignore static is fine
    this.remote.on(RemoteDebugger.EVENT_FRAMES_DETACHED, () => {
      if (isNonEmptyArray(this.curWebFrames)) {
        const curWebFrames = this.curWebFrames;
        this.log.debug(
          `Clearing ${util.pluralize('frame', curWebFrames.length, true)}: ${curWebFrames.join(
            ', ',
          )}`,
        );
      }
      this.curWebFrames = [];
    });

    await this.remote.connect(this.opts.webviewConnectTimeout);
  },

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
   * @param {number} waitForWebviewMs - The period to poll for available webview(s) (in ms)
   * @returns {Promise<Context[]>} The list of available context objects along with their properties.
   * @this {XCUITestDriver}
   */
  async mobileGetContexts(waitForWebviewMs = 0) {
    // make sure it is a number, so the duration check works properly
    if (!_.isNumber(waitForWebviewMs)) {
      waitForWebviewMs = parseInt(waitForWebviewMs, 10);
      if (isNaN(waitForWebviewMs)) {
        waitForWebviewMs = 0;
      }
    }

    const curOpt = this.opts.fullContextList;
    this.opts.fullContextList = true;

    const timer = new timing.Timer().start();
    try {
      /** @type {FullContext[]} */
      let contexts;
      do {
        contexts = /** @type {FullContext[]} */ (await this.getContexts());

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
  },
  /**
   * @param {import('./types').PageChangeNotification} pageChangeNotification
   * @this {XCUITestDriver}
   */
  async onPageChange(pageChangeNotification) {
    this.log.debug(
      `Remote debugger notified us of a new page listing: ${JSON.stringify(
        pageChangeNotification,
      )}`,
    );
    if (this.selectingNewPage) {
      this.log.debug('We are in the middle of selecting a page, ignoring');
      return;
    }
    if (!this.remote || !this.remote.isConnected) {
      this.log.debug('We have not yet connected, ignoring');
      return;
    }

    const {appIdKey, pageArray} = pageChangeNotification;

    let newIds = [];
    let newPages = [];
    let keyId = null;

    // Checks if a URL is blacklisted in the 'safariIgnoreWebHostnames' capability
    function isUrlIgnored(url, safariIgnoreWebHostnames) {
      const ignoredHosts = (safariIgnoreWebHostnames || '')
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
          } catch (ign) {
            // do nothing if invalid URL
          }
        }
      }
      return false;
    }

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

    let newPage = null;
    if (newPages.length) {
      newPage = _.last(newPages);
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
        this.setCurrentUrl(undefined);
        return;
      }

      this.log.debug(`Debugger already selected page '${keyId}', ` + `confirming that choice.`);
      this.curContext = `${appIdKey}.${keyId}`;
      newPage = keyId;
    } else {
      // at this point, there are no new pages, and the current page still exists
      this.log.debug('Checking if page needs to load');
      // If a window navigates to an anchor it doesn't always fire a page
      // callback event. Let's check if we wound up in such a situation.
      const needsPageLoad = (() => {
        // need to map the page ids to context ids
        const contextArray = _.map(pageArray, (page) => `${appIdKey}.${page.id}`);
        // check if the current context exists in both our recorded contexts,
        // and the page array
        return !_.isEqual(
          _.find(this.contexts, this.curContext),
          _.find(contextArray, this.curContext),
        );
      })();

      if (needsPageLoad) {
        this.log.debug('Page load needed. Loading...');
        await this.remote.waitForDom();
      }

      this.log.debug('New page listing is same as old, doing nothing');
    }

    // make sure that the page listing isn't indicating a redirect
    if (util.hasValue(this.curContext)) {
      let currentPageId = parseInt(String(_.last(this.curContext.split('.'))), 10);
      let page = _.find(pageArray, (p) => parseInt(String(p.id), 10) === currentPageId);
      if (page && page.url !== this.getCurrentUrl()) {
        this.log.debug(`Redirected from '${this.getCurrentUrl()}' to '${page.url}'`);
        this.setCurrentUrl(page.url);
      }
    }

    if (util.hasValue(newPage)) {
      this.selectingNewPage = true;
      const oldContext = this.curContext;
      this.curContext = `${appIdKey}.${newPage}`;
      // do not wait, as this can take a long time, and the response is not necessary
      // eslint-disable-next-line promise/prefer-await-to-callbacks, promise/prefer-await-to-then
      this.remote.selectPage(appIdKey, parseInt(newPage, 10)).catch((err) => {
        this.log.warn(`Failed to select page: ${err.message}`);
        this.curContext = oldContext;
      });
      this.selectingNewPage = false;
    }
    this.windowHandleCache = pageArray;
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  async stopRemote(closeWindowBeforeDisconnecting = false) {
    if (!this.remote) {
      throw this.log.errorWithException('Tried to leave a web frame but were not in one');
    }

    if (closeWindowBeforeDisconnecting) {
      await this.closeWindow();
    }
    await this.remote.disconnect();
    this.curContext = null;
    this.curWebFrames = [];
    this.remote = null;
  },
  /**
   * @this {XCUITestDriver}
   */
  setCurrentUrl(url) {
    this._currentUrl = url;
  },
  /**
   * @this {XCUITestDriver}
   */
  getCurrentUrl() {
    return this._currentUrl;
  },
  /**
   * @param {RegExp} titleRegExp
   * @param {RegExp} urlRegExp
   * @this {XCUITestDriver}
   */
  async getRecentWebviewContextId(titleRegExp, urlRegExp) {
    if (!_.isRegExp(titleRegExp) && !_.isRegExp(urlRegExp)) {
      throw new errors.InvalidArgumentError(
        'A regular expression for either web view title or url must be provided',
      );
    }

    const currentUrl = this.getCurrentUrl();
    const contexts = _.filter(await this.getContextsAndViews(false), 'view');
    // first try to match by current url
    if (currentUrl) {
      const ctx = contexts.find(({view}) => (view.url || '') === currentUrl);
      if (ctx) {
        return ctx.id;
      }
    }
    // if not, try to match by regular expression
    return contexts.find(
      ({view}) =>
        (view.title && titleRegExp?.test(view.title)) || (view.url && urlRegExp?.test(view.url)),
    )?.id;
  },
  /**
   * @this {XCUITestDriver}
   */
  isWebContext() {
    return !!this.curContext && this.curContext !== NATIVE_WIN;
  },
  /**
   * @this {XCUITestDriver}
   */
  isWebview() {
    return this.isWebContext();
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<RemoteDebugger>}
   */
  async getNewRemoteDebugger() {
    let socketPath;
    if (!this.isRealDevice()) {
      socketPath = await /** @type {import('../driver').Simulator} */ (this.device).getWebInspectorSocket();
    }
    return createRemoteDebugger(
      {
        bundleId: this.opts.bundleId,
        additionalBundleIds: this.opts.additionalWebviewBundleIds,
        isSafari: this.isSafari(),
        includeSafari: this.opts.includeSafariInWebviews,
        useNewSafari: this.useNewSafari(),
        pageLoadMs: this.pageLoadMs,
        platformVersion: this.opts.platformVersion,
        socketPath,
        remoteDebugProxy: this.opts.remoteDebugProxy,
        garbageCollectOnExecute: util.hasValue(this.opts.safariGarbageCollect)
          ? !!this.opts.safariGarbageCollect
          : false,
        udid: this.opts.udid,
        logAllCommunication: this.opts.safariLogAllCommunication,
        logAllCommunicationHexDump: this.opts.safariLogAllCommunicationHexDump,
        socketChunkSize: this.opts.safariSocketChunkSize,
        webInspectorMaxFrameLength: this.opts.safariWebInspectorMaxFrameLength,
        pageLoadStrategy: this.caps.pageLoadStrategy,
      },
      this.isRealDevice(),
    );
  },
};

const commands = {
  /**
   * @this {XCUITestDriver}
   */
  // eslint-disable-next-line require-await
  async getCurrentContext() {
    if (this.curContext && this.curContext !== NATIVE_WIN) {
      return `${WEBVIEW_BASE}${this.curContext}`;
    }
    return NATIVE_WIN;
  },

  /**
   * Set context
   *
   * @param {string|Context} name - The name of context to set. It could be 'null' as NATIVE_WIN.
   * @param {any} [callback] The callback. (It is not called in this method)
   * @param {boolean} skipReadyCheck - Whether it waits for the new context is ready
   * @this {XCUITestDriver}
   */
  async setContext(name, callback, skipReadyCheck = false) {
    function alreadyInContext(desired, current) {
      return (
        desired === current ||
        (desired === null && current === NATIVE_WIN) ||
        (desired === NATIVE_WIN && current === null)
      );
    }
    function isNativeContext(context) {
      return context === NATIVE_WIN || context === null;
    }

    // allow the full context list to be passed in
    const strName = String(typeof name === 'object' && name.id ? name.id : name);

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
      contextId = /** @type {string[]} */ (this.contexts)[1];
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
      await (/** @type {RemoteDebugger} */ (this.remote)).selectPage(appIdKey, pageIdKey, skipReadyCheck);
    } catch (err) {
      this.curContext = this.curWindowHandle = oldContext;
      throw err;
    } finally {
      this.selectingNewPage = false;
    }

    // attempt to start performance logging, if requested
    if (this.opts.enablePerformanceLogging && this.remote) {
      this.log.debug(`Starting performance log on '${this.curContext}'`);
      this.logs.performance = new IOSPerformanceLog({
        remoteDebugger: this.remote,
        log: this.log,
      });
      await this.logs.performance.startCapture();
    }

    // start safari logging if the logs handlers are active
    if (name && name !== NATIVE_WIN && this.logs) {
      if (this.logs.safariConsole) {
        (/** @type {RemoteDebugger} */ (this.remote)).startConsole(
          this.logs.safariConsole.onConsoleLogEvent.bind(this.logs.safariConsole),
        );
      }
      if (this.logs.safariNetwork) {
        (/** @type {RemoteDebugger} */ (this.remote)).startNetwork(
          this.logs.safariNetwork.onNetworkEvent.bind(this.logs.safariNetwork),
        );
      }
    }
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<string[]|FullContext[]>}
   */
  async getContexts() {
    this.log.debug('Getting list of available contexts');
    const contexts = await this.getContextsAndViews(false);

    if (this.opts.fullContextList) {
      return /** @type {import('./types').FullContext[]} */ (
        contexts.map((context) => ({
          id: context.id.toString(),
          title: context.view.title,
          url: context.view.url,
          bundleId: context.view.bundleId,
        }))
      );
    }
    return /** @type {string[]} */ (contexts.map((context) => context.id.toString()));
  },

  /**
   * @this {XCUITestDriver}
   */
  async setWindow(name, skipReadyCheck) {
    try {
      await this.setContext(name, _.noop, skipReadyCheck);
    } catch (err) {
      // translate the error in terms of windows
      throw isErrorType(err, errors.NoSuchContextError) ? new errors.NoSuchWindowError() : err;
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  // eslint-disable-next-line require-await
  async getWindowHandle() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }
    if (!this.curContext) {
      throw new errors.InvalidContextError();
    }
    this.log.debug(`Getting current window handle`);
    return this.curContext;
  },
  /**
   * @this {XCUITestDriver}
   */
  async getWindowHandles() {
    if (!this.isWebContext()) {
      throw new errors.NotImplementedError();
    }
    this.log.debug('Getting list of available window handles');
    const contexts = await this.getContextsAndViews(false);
    return (
      contexts
        // get rid of the native app context
        .filter((context) => context.id !== NATIVE_WIN)
        // get the `app.id` format expected
        .map((context) =>
          /**
           * This is non-nullable because the `FullContext` having `id` `NATIVE_WIN` _looks like_ the only with an empty view.
           * @type {NonNullable<FullContext['view']['id']>}
           */ (context.view.id).toString(),
        )
    );
  },
};

export default {...helpers, ...extensions, ...commands};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').Context} Context
 * @typedef {import('./types').FullContext} FullContext
 */
