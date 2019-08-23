import { errors, routeToCommandName } from 'appium-base-driver';
import log from '../logger';
import B from 'bluebird';


const GET = 'GET';
const POST = 'POST';
const DELETE = 'DELETE';
const SUPPORTED_METHODS = [GET, POST, DELETE];

let helpers = {}, extensions = {};

const WDA_ROUTES = {
  '/wda/touch/perform': {
    POST: 'performTouch',
  },
  '/wda/touch/multi/perform': {
    POST: 'performMultiAction',
  },
  '/wda/screen': {
    GET: 'getScreenInfo',
  },
  '/wda/alert/buttons': {
    GET: 'getAlertButtons',
  },
  '/wda/apps/launch': {
    POST: 'mobileLaunchApp',
  },
  '/wda/apps/terminate': {
    POST: 'mobileTerminateApp',
  },
  '/wda/apps/activate': {
    POST: 'mobileActivateApp',
  },
  '/wda/apps/state': {
    POST: 'mobileQueryAppState',
  },
  '/wda/keys': {
    POST: 'keys',
  },
  '/wda/touch_id': {
    POST: 'touchId',
  },
  '/wda/keyboard/dismiss': {
    POST: 'hideKeyboard',
  },
  '/wda/lock': {
    POST: 'lock',
  },
  '/wda/unlock': {
    POST: 'unlock',
  },
  '/wda/locked': {
    GET: 'isLocked',
  },
  '/wda/tap/nil': {
    POST: 'clickCoords',
  },
  '/window/size': {
    GET: 'getWindowSize',
  },
};

function wdaRouteToCommandName (endpoint, method) {
  return WDA_ROUTES[endpoint] ? WDA_ROUTES[endpoint][method] : null;
}

helpers.proxyCommand = async function proxyCommand (endpoint, method, body, isSessionCommand = true) {
  if (this.shutdownUnexpectedly) {
    return;
  }

  if (!endpoint) {
    log.errorAndThrow('Proxying requires an endpoint');
  } else if (!SUPPORTED_METHODS.includes(method)) {
    log.errorAndThrow(`Proxying only works for the following requests: ${SUPPORTED_METHODS.join(', ')}`);
  }

  if (!this.wda) {
    throw new Error('Cannot call proxyCommand without WDA driver active');
  }
  const proxy = isSessionCommand ? this.wda.jwproxy : this.wda.noSessionProxy;
  if (!proxy) {
    throw new Error('Cannot call proxyCommand without WDA proxy active');
  }

  let cmdName = wdaRouteToCommandName(endpoint, method) || routeToCommandName(endpoint, method);
  const timeout = this._getCommandTimeout(cmdName);
  if (!cmdName) {
    // this should never happen except when adding new routes
    cmdName = 'Unknown'; // just for logging purposes below
    log.info(`Proxying to WDA with an unknown route: ${method} ${endpoint}`);
  }

  if (!timeout) {
    return await proxy.command(endpoint, method, body);
  }

  log.debug(`Setting custom timeout to ${timeout} ms for '${cmdName}' command`);
  let isCommandExpired = false;
  const res = await B.resolve(proxy.command(endpoint, method, body))
                .timeout(timeout)
                .catch(B.Promise.TimeoutError, () => {
                  isCommandExpired = true;
                });
  if (isCommandExpired) {
    proxy.cancelActiveRequests();
    const errMsg = `Appium did not get any response from '${cmdName}' command in ${timeout} ms`;
    await this.startUnexpectedShutdown(new errors.TimeoutError(errMsg));
    log.errorAndThrow(errMsg);
  }
  return res;
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
