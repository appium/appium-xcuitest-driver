import { iosCommands, NATIVE_WIN } from 'appium-ios-driver';
import { RemoteDebugger } from 'appium-remote-debugger';


let extensions = {};

Object.assign(extensions, iosCommands.context);

// override, as appium-ios-driver's version uses UI Automation to close
extensions.closeAlertBeforeTest = async function () {
  return true;
};

extensions._setContext = extensions.setContext;
extensions.setContext = async function (name, callback, skipReadyCheck) {
  await this._setContext(name, callback, skipReadyCheck);

  // start safari console logging if the logs handler is active
  if (name && name !== NATIVE_WIN) {
    if (this.logs && this.logs.safariConsole) {
      await this.remote.startConsole(this.logs.safariConsole.addLogLine.bind(this.logs.safariConsole));
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
  });
};


export default extensions;
