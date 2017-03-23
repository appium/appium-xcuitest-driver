import { iosCommands } from 'appium-ios-driver';


let extensions = {};

Object.assign(extensions, iosCommands.context);

// override, as appium-ios-driver's version uses UI Automation to close
extensions.closeAlertBeforeTest = async function () {
  return true;
};

// the appium-ios-driver version of this function fails in CI,
// and the wrong webview is almost always retrieved
extensions._getLatestWebviewContextForTitle = extensions.getLatestWebviewContextForTitle;
extensions.getLatestWebviewContextForTitle = async function (regExp) {
  let currentUrl = this.getCurrentUrl();
  if (!currentUrl) {
    return this._getLatestWebviewContextForTitle(regExp);
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
  } else {
    return await this._getLatestWebviewContextForTitle(regExp);
  }
};

extensions.isWebContext = function () {
  return !!this.curContext && this.curContext !== iosCommands.context.NATIVE_WIN;
};

extensions.isWebview = function () {
  return this.isWebContext();
};


export default extensions;
