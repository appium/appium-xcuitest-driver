import { errors } from 'appium-base-driver';
import logger from '../logger';

const WEBVIEW_WIN = 'WEBVIEW';
const WEBVIEW_BASE = `${WEBVIEW_WIN}_`;
const NATIVE_WIN = 'NATIVE_APP';

let commands = {};

commands.getCurrentContext = async function () {
  if (this.inWebview()) {
    let safariDriver = await this.getSafariDriver();
    return await safariDriver.getCurrentContext();
  } else {
    return NATIVE_WIN;
  }
};

commands.getContexts = async function () {
  logger.debug('Getting list of available contexts');
  let contexts = [];
  // safariDriver can be null, if no webviews are present
  let safariDriver = await this.getSafariDriver();
  if (safariDriver) {
    contexts = await safariDriver.getContextsAndViews();
  }

  if (!this.isSafari()) {
    contexts.push({id: NATIVE_WIN});
  }
  return contexts.map((context) => context.id);
};

commands.setContext = async function (name, callback, skipReadyCheck) {
  if (name === NATIVE_WIN) {
    if (this.isSafari()) {
      logger.error('Native context not supported with XCUITest automation');
      throw new errors.NotImplementedError();
    }
    if (!this.inWebview()) {
      logger.debug('Already in native webview');
      return;
    }

    this.webview = false;
  } else {
    let safariDriver = await this.getSafariDriver();
    let returned = await safariDriver.setContext(name, callback, skipReadyCheck);
    this.webview = true; // only set this to true after the safariDriver command is successful
    this.jwpProxyActive = false;
    return returned;
  }
};

export { commands, WEBVIEW_WIN, WEBVIEW_BASE };
export default commands;
