import { errors } from 'mobile-json-wire-protocol';
import logger from '../logger';

const WEBVIEW_WIN = 'WEBVIEW';
const WEBVIEW_BASE = `${WEBVIEW_WIN}_`;
const NATIVE_WIN = 'NATIVE_APP';

let commands = {};

commands.getCurrentContext = async function () {
  if (this.inWebview()) {
    return await this.safariDriver.getCurrentContext();
  } else {
    return NATIVE_WIN;
  }
};

commands.getContexts = async function () {
  logger.debug('Getting list of available contexts');
  let contexts = await this.safariDriver.getContextsAndViews();
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
    let returned = await this.safariDriver.setContext(name, callback, skipReadyCheck);
    this.webview = true; // only set this to true after the safariDriver command is successful
    return returned;
  }
};

export { commands, WEBVIEW_WIN, WEBVIEW_BASE };
export default commands;
