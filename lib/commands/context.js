import { iosCommands, NATIVE_WIN } from 'appium-ios-driver';
import { RemoteDebugger } from 'appium-remote-debugger';
import { util } from 'appium-support';

let extensions = {};

Object.assign(extensions, iosCommands.context);

// override, as appium-ios-driver's version uses UI Automation to close
extensions.closeAlertBeforeTest = async function () { // eslint-disable-line require-await
  return true;
};

extensions._setContext = extensions.setContext;
extensions.setContext = async function (name, callback, skipReadyCheck) {
  await this._setContext(name, callback, skipReadyCheck);

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

// the appium-ios-driver version of this function fails in CI,
// and the wrong webview is almost always retrieved
extensions._getLatestWebviewContextForTitle = extensions.getLatestWebviewContextForTitle;
extensions.getLatestWebviewContextForTitle = async function (regExp) {
  let currentUrl = this.getCurrentUrl();
  if (!currentUrl) {
    return await this._getLatestWebviewContextForTitle(regExp);
  }

  let contexts = await this.getContextsAndViews();
  let matchingCtx;
  for (let ctx of contexts) {
    if (ctx.view) {
      let url = ctx.view.url || '';
      if (url === this.getCurrentUrl()) {
        matchingCtx = ctx;
        break;
      }
    }
  }
  if (matchingCtx) {
    return matchingCtx.id;
  }
  return await this._getLatestWebviewContextForTitle(regExp);
};

extensions.isWebContext = function () {
  return !!this.curContext && this.curContext !== iosCommands.context.NATIVE_WIN;
};

extensions.isWebview = function () {
  return this.isWebContext();
};

extensions.getNewRemoteDebugger = async function () {
  const socketPath = await this.opts.device.getWebInspectorSocket();
  return new RemoteDebugger({
    bundleId: this.opts.bundleId,
    useNewSafari: this.useNewSafari(),
    pageLoadMs: this.pageLoadMs,
    platformVersion: this.opts.platformVersion,
    socketPath,
    remoteDebugProxy: this.opts.remoteDebugProxy,
    garbageCollectOnExecute: util.hasValue(this.opts.safariGarbageCollect)
      ? !!this.opts.safariGarbageCollect
      : true,
  });
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
extensions.mobileGetContexts = async function () {
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


export default extensions;
