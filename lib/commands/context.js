import { iosCommands, IOSPerformanceLog, NATIVE_WIN, WEBVIEW_WIN } from 'appium-ios-driver';
import { createRemoteDebugger, RemoteDebugger } from 'appium-remote-debugger';
import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
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
  }, this.isRealDevice());
};

commands.setContext = async function setContext (name, callback, skipReadyCheck) {
  function alreadyInContext (desired, current) {
    return (desired === current ||
           (desired === null && current === NATIVE_WIN) ||
           (desired === NATIVE_WIN && current === null));
  }
  function isNativeContext (context) {
    return context === NATIVE_WIN || context === null;
  }

  log.debug(`Attempting to set context to '${name}'`);
  if (alreadyInContext(name, this.curContext)) {
    // already in the named context, no need to do anything
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

  let contextId = name.replace(WEBVIEW_BASE, '');
  if (contextId === '') {
    // allow user to pass in "WEBVIEW" without an index
    // the second context will be the first webview as
    // the first is always NATIVE_APP
    contextId = this.contexts[1];
  }
  if (!_.includes(this.contexts, contextId)) {
    throw new errors.NoSuchContextError();
  }

  // `contextId` will be in the form of `appId.pageId` in this case
  const [appIdKey, pageIdKey] = _.map(contextId.split('.'), (id) => parseInt(id, 10));
  await this.remote.selectPage(appIdKey, pageIdKey, skipReadyCheck);
  this.curContext = contextId;

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
    // not connected
    this.remote = await this.getNewRemoteDebugger();

    let appInfo = await this.remote.connect();
    if (!appInfo) {
      log.debug('Unable to connect to the remote debugger.');
      return [];
    }
    pageArray = await getWebviewPages();
    this.remote.on(RemoteDebugger.EVENT_PAGE_CHANGE, this.onPageChange.bind(this));
    this.remote.on(RemoteDebugger.EVENT_FRAMES_DETACHED, () => {
      if (!_.isEmpty(this.curWebFrames)) {
        log.debug(`Clearing ${this.curWebFrames.length} frames: ${this.curWebFrames.join(', ')}`);
      }
      this.curWebFrames = [];
    });

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
 * @returns {Array} List of Context objects
 */
extensions.mobileGetContexts = async function mobileGetContexts () {
  const curOpt = this.opts.fullContextList;
  try {
    // `appium-ios-driver#getContexts` returns the full list of contexts
    // if this option is on
    this.opts.fullContextList = true;
    return await this.getContexts();
  } finally {
    // reset the option so there are no side effects
    this.opts.fullContextList = curOpt;
  }
};


Object.assign(extensions, commands, helpers);
export default extensions;
