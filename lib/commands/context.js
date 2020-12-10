import { iosCommands, IOSPerformanceLog, NATIVE_WIN, WEBVIEW_WIN } from 'appium-ios-driver';
import { createRemoteDebugger, RemoteDebugger } from 'appium-remote-debugger';
import { errors, isErrorType } from 'appium-base-driver';
import { util, timing } from 'appium-support';
import log from '../logger';
import { retryInterval } from 'asyncbox';
import _ from 'lodash';


const WEBVIEW_BASE = `${WEBVIEW_WIN}_`;

let commands = {}, helpers = {}, extensions = {};

Object.assign(extensions, iosCommands.context);

// override, as appium-ios-driver's version uses UI Automation to close
extensions.closeAlertBeforeTest = async function closeAlertBeforeTest () { // eslint-disable-line require-await
  return true;
};

// the appium-ios-driver version has a wait on real devices, which is no longer
// necessary
extensions.navToInitialWebview = async function navToInitialWebview () {
  if (this.useNewSafari()) {
    await this.typeAndNavToUrl();
  } else if (!this.isRealDevice() && this.opts.safari) {
    await this.navToViewThroughFavorites();
  } else {
    await this.navToViewWithTitle(/.*/);
  }
};

// the appium-ios-driver version of this function fails in CI,
// and the wrong webview is almost always retrieved
// also override so that the case where the SDK version is not set does not fail
extensions.getLatestWebviewContextForTitle = async function getLatestWebviewContextForTitle (regExp) {
  const currentUrl = this.getCurrentUrl();

  const contexts = _.filter(await this.getContextsAndViews(), 'view');

  if (currentUrl) {
    // first try to match by current url
    for (const ctx of contexts) {
      if ((ctx.view.url || '') === this.getCurrentUrl()) {
        return ctx.id;
      }
    }
  }

  // if not, try to match by regular expression
  for (const ctx of contexts) {
    if ((ctx.view.title && regExp.test(ctx.view.title)) || (ctx.view.url && regExp.test(ctx.view.url))) {
      return ctx.id;
    }
  }
};

extensions.isWebContext = function isWebContext () {
  return !!this.curContext && this.curContext !== iosCommands.context.NATIVE_WIN;
};

extensions.isWebview = function isWebview () {
  return this.isWebContext();
};

extensions.getNewRemoteDebugger = async function getNewRemoteDebugger () {
  let socketPath;
  if (!this.isRealDevice()) {
    socketPath = await this.opts.device.getWebInspectorSocket();
  }
  return createRemoteDebugger({
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
    webInspectorMaxFrameLength: this.opts.safariWebInspectorMaxFrameLength
  }, this.isRealDevice());
};

/**
 * Set context
 *
 * @param {?string} name - The name of context to set. It could be 'null' as NATIVE_WIN.
 * @param {callback} callback The callback. (It is not called in this method)
 * @param {boolean} skipReadyCheck - Whether it waits for the new context is ready
 */
commands.setContext = async function setContext (name, callback, skipReadyCheck) {
  function alreadyInContext (desired, current) {
    return (desired === current ||
           (desired === null && current === NATIVE_WIN) ||
           (desired === NATIVE_WIN && current === null));
  }
  function isNativeContext (context) {
    return context === NATIVE_WIN || context === null;
  }

  // allow the full context list to be passed in
  if (name && name.id) {
    name = name.id;
  }

  log.debug(`Attempting to set context to '${name || NATIVE_WIN}' from '${this.curContext ? this.curContext : NATIVE_WIN}'`);

  if (alreadyInContext(name, this.curContext) || alreadyInContext(_.replace(name, WEBVIEW_BASE, ''), this.curContext)) {
    // already in the named context, no need to do anything
    log.debug(`Already in '${name || NATIVE_WIN}' context. Doing nothing.`);
    return;
  }
  if (isNativeContext(name)) {
    // switching into the native context
    this.curContext = null;
    return;
  }

  // switching into a webview context

  // if contexts have not already been retrieved, get them
  if (_.isUndefined(this.contexts)) {
    await this.getContexts();
  }

  let contextId = _.replace(name, WEBVIEW_BASE, '');
  if (contextId === '') {
    // allow user to pass in "WEBVIEW" without an index
    // the second context will be the first webview as
    // the first is always NATIVE_APP
    contextId = this.contexts[1];
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
  } catch (err) {
    this.curContext = this.curWindowHandle = oldContext;
    throw err;
  } finally {
    this.selectingNewPage = false;
  }

  // attempt to start performance logging, if requested
  if (this.opts.enablePerformanceLogging && this.remote) {
    log.debug(`Starting performance log on '${this.curContext}'`);
    this.logs.performance = new IOSPerformanceLog(this.remote);
    await this.logs.performance.startCapture();
  }

  // start safari logging if the logs handlers are active
  if (name && name !== NATIVE_WIN && this.logs) {
    if (this.logs.safariConsole) {
      await this.remote.startConsole(this.logs.safariConsole.addLogLine.bind(this.logs.safariConsole));
    }
    if (this.logs.safariNetwork) {
      await this.remote.startNetwork(this.logs.safariNetwork.addLogLine.bind(this.logs.safariNetwork));
    }
  }
};

extensions.connectToRemoteDebugger = async function connectToRemoteDebugger () {
  this.remote = await this.getNewRemoteDebugger();

  this.remote.on(RemoteDebugger.EVENT_PAGE_CHANGE, this.onPageChange.bind(this));
  this.remote.on(RemoteDebugger.EVENT_FRAMES_DETACHED, () => {
    if (!_.isEmpty(this.curWebFrames)) {
      log.debug(`Clearing ${util.pluralize('frame', this.curWebFrames.length, true)}: ${this.curWebFrames.join(', ')}`);
    }
    this.curWebFrames = [];
  });

  await this.remote.connect(this.opts.webviewConnectTimeout);
};

extensions.listWebFrames = async function listWebFrames (useUrl = true) {
  if (!this.opts.bundleId) {
    log.errorAndThrow('Cannot enter web frame without a bundle ID');
  }

  useUrl = useUrl && !this.isRealDevice() && !!this.getCurrentUrl();
  log.debug(`Selecting by url: ${useUrl} ${useUrl ? `(expected url: '${this.getCurrentUrl()}')` : ''}`);

  const currentUrl = useUrl ? this.getCurrentUrl() : undefined;
  let pageArray = [];
  const getWebviewPages = async () => {
    try {
      return await this.remote.selectApp(currentUrl, this.opts.webviewConnectRetries, this.opts.ignoreAboutBlankUrl);
    } catch (err) {
      log.debug(`No available web pages: ${err.message}`);
      return [];
    }
  };

  if (this.remote && this.remote.appIdKey) {
    // already connected
    pageArray = await getWebviewPages();
  } else {
    if (!this.remote) {
      await this.connectToRemoteDebugger();
    }
    await this.remote.setConnectionKey();

    pageArray = await getWebviewPages();

    const alertErrorMsg = 'Close alert failed. Retry.';
    try {
      await retryInterval(6, 1000, async () => {
        if (!await this.closeAlertBeforeTest()) {
          throw new Error(alertErrorMsg);
        }
      });
    } catch (err) {
      // if the loop to close alerts failed to dismiss, ignore,
      // otherwise log and throw the error
      if (err.message !== alertErrorMsg) {
        log.errorAndThrow(err);
      }
    }
  }

  if (pageArray.length === 0) {
    // we have no web frames, but continue anyway
    log.debug('No web frames found.');
  }
  return pageArray;
};

commands.getContexts = async function getContexts () {
  log.debug('Getting list of available contexts');
  const contexts = await this.getContextsAndViews(false);

  const mapFn = this.opts.fullContextList
    ? function (context) {
      return {
        id: context.id.toString(),
        title: context.view.title,
        url: context.view.url,
        bundleId: context.view.bundleId,
      };
    }
    : (context) => context.id.toString();
  return contexts.map(mapFn);
};

/**
 * @typedef {Object} Context
 *
 * @property {string} id - The identifier of the context. The native context
 *                          will be 'NATIVE_APP' and the webviews will be
 *                          'WEBVIEW_xxx'
 * @property {?string} title - The title associated with the webview content
 * @property {?string} url - The url associated with the webview content
 */

/**
 * Get the contexts available, with information about the url and title of each
 * webview
 *
 * @param {Object} opts - Options set, which can include `waitForWebviewMs` to
 *                        specify the period to poll for available webviews
 * @returns {Array} List of Context objects
 */
extensions.mobileGetContexts = async function mobileGetContexts (opts = {}) {
  let {
    waitForWebviewMs = 0,
  } = opts;

  // make sure it is a number, so the duration check works properly
  if (!_.isNumber(waitForWebviewMs)) {
    waitForWebviewMs = parseInt(waitForWebviewMs, 10);
    if (isNaN(waitForWebviewMs)) {
      waitForWebviewMs = 0;
    }
  }

  const curOpt = this.opts.fullContextList;
  // `appium-ios-driver#getContexts` returns the full list of contexts
  // if this option is on
  this.opts.fullContextList = true;

  const timer = new timing.Timer().start();
  try {
    let contexts;
    do {
      contexts = await this.getContexts();

      if (contexts.length >= 2) {
        log.debug(`Found webview context after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
        return contexts;
      }
      log.debug(`No webviews found in ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
    } while (timer.getDuration().asMilliSeconds < waitForWebviewMs);
    return contexts;
  } finally {
    // reset the option so there are no side effects
    this.opts.fullContextList = curOpt;
  }
};

commands.setWindow = async function setWindow (name, skipReadyCheck) {
  try {
    await this.setContext(name, _.noop, skipReadyCheck);
  } catch (err) {
    // translate the error in terms of windows
    throw isErrorType(err, errors.NoSuchContextError)
      ? new errors.NoSuchWindowError()
      : err;
  }
};

commands.getWindowHandle = async function getWindowHandle () { // eslint-disable-line require-await
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }
  log.debug(`Getting current window handle`);
  return this.curContext;
};

commands.getWindowHandles = async function getWindowHandles () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }
  log.debug('Getting list of available window handles');
  const contexts = await this.getContextsAndViews(false);
  return contexts
    // get rid of the native app context
    .filter((context) => context.id !== NATIVE_WIN)
    // get the `app.id` format expected
    .map((context) => context.view.id.toString());
};

extensions.onPageChange = async function onPageChange (pageChangeNotification) {
  log.debug(`Remote debugger notified us of a new page listing: ${JSON.stringify(pageChangeNotification)}`);
  if (this.selectingNewPage) {
    log.debug('We are in the middle of selecting a page, ignoring');
    return;
  }
  if (!this.remote || !this.remote.isConnected) {
    log.debug('We have not yet connected, ignoring');
    return;
  }

  const {appIdKey, pageArray} = pageChangeNotification;

  let newIds = [];
  let newPages = [];
  let keyId = null;

  // Checks if a URL is blacklisted in the 'safariIgnoreWebHostnames' capability
  function isUrlIgnored (url, safariIgnoreWebHostnames) {
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
        log.info(`Not tracking '${page.url}' page because it is blacklisted. ` +
          `'safariIgnoreWebHostnames'=${this.opts.safariIgnoreWebHostnames}`);
      } else {
        newPages.push(id);
        this.contexts.push(contextId);
      }
    }
  }

  if (!keyId) {
    // if there is no key id, pull the first id from the page array and use that
    // as a stand in
    log.debug('No key id found. Choosing first id from page array');
    keyId = newIds[0] || null;
  }

  if (!util.hasValue(this.curContext)) {
    log.debug('We do not appear to have window set yet, ignoring');
    return;
  }

  const [curAppIdKey, curPageIdKey] = this.curContext.split('.');

  if (curAppIdKey !== appIdKey) {
    log.debug('Page change not referring to currently selected app, ignoring.');
    return;
  }

  let newPage = null;
  if (newPages.length) {
    newPage = _.last(newPages);
    log.debug(`We have new pages, selecting page '${newPage}'`);
  } else if (!_.includes(newIds, curPageIdKey)) {
    log.debug('New page listing from remote debugger does not contain ' +
                 'current window; assuming it is closed');
    if (!util.hasValue(keyId)) {
      log.error('Do not have our current window anymore, and there ' +
                   'are not any more to load! Doing nothing...');
      this.setCurrentUrl(undefined);
      return;
    }

    log.debug(`Debugger already selected page '${keyId}', ` +
                 `confirming that choice.`);
    this.curContext = `${appIdKey}.${keyId}`;
    newPage = keyId;
  } else {
    // at this point, there are no new pages, and the current page still exists
    log.debug('Checking if page needs to load');
    // If a window navigates to an anchor it doesn't always fire a page
    // callback event. Let's check if we wound up in such a situation.
    const needsPageLoad = (() => {
      // need to map the page ids to context ids
      const contextArray = _.map(pageArray, (page) => `${appIdKey}.${page.id}`);
      // check if the current context exists in both our recorded contexts,
      // and the page array
      return !_.isEqual(_.find(this.contexts, this.curContext), _.find(contextArray, this.curContext));
    })();

    if (needsPageLoad) {
      log.debug('Page load needed. Loading...');
      await this.remote.pageLoad();
    }

    log.debug('New page listing is same as old, doing nothing');
  }

  // make sure that the page listing isn't indicating a redirect
  if (util.hasValue(this.curContext)) {
    let currentPageId = parseInt(_.last(this.curContext.split('.')), 10);
    let page = _.find(pageArray, (p) => parseInt(p.id, 10) === currentPageId);
    if (page && page.url !== this.getCurrentUrl()) {
      log.debug(`Redirected from '${this.getCurrentUrl()}' to '${page.url}'`);
      this.setCurrentUrl(page.url);
    }
  }

  if (util.hasValue(newPage)) {
    this.selectingNewPage = true;
    const oldContext = this.curContext;
    this.curContext = `${appIdKey}.${newPage}`;
    // do not wait, as this can take a long time, and the response is not necessary
    this.remote.selectPage(appIdKey, parseInt(newPage, 10))
      .catch((err) => { // eslint-disable-line promise/prefer-await-to-callbacks
        log.warn(`Failed to select page: ${err.message}`);
        this.curContext = oldContext;
      });
    this.selectingNewPage = false;
  }
  this.windowHandleCache = pageArray;
};


Object.assign(extensions, commands, helpers);
export default extensions;
