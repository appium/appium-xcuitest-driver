import {errors, routeToCommandName} from 'appium/driver';
import B from 'bluebird';

const GET = 'GET';
const POST = 'POST';
const DELETE = 'DELETE';
const SUPPORTED_METHODS = Object.freeze(new Set(/** @type {const} */ ([GET, POST, DELETE])));

const WDA_ROUTES = /** @type {const} */ ({
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
  '/window/size': {
    GET: 'getWindowSize',
  },
});

/**
 * @param {string} endpoint
 * @param {AllowedHttpMethod} method
 * @returns {string|undefined}
 */
function wdaRouteToCommandName(endpoint, method) {
  if (endpoint in WDA_ROUTES) {
    return WDA_ROUTES[endpoint][method];
  }
}
export default {
  /**
   * Proxies a command to WebDriverAgent
   * @template [TReq=any]
   * @template [TRes=unknown]
   * @param {string} url
   * @param {AllowedHttpMethod} method
   * @param {TReq} [body]
   * @param {boolean} isSessionCommand
   * @this {import('../driver').XCUITestDriver}
   * @returns {Promise<TRes>}
   */
  async proxyCommand(url, method, body, isSessionCommand = true) {
    if (this.shutdownUnexpectedly) {
      return /** @type {TRes} */ (undefined);
    }

    if (!url) {
      this.log.errorAndThrow('Proxying requires an endpoint');
    } else if (!SUPPORTED_METHODS.has(method)) {
      this.log.errorAndThrow(
        `Proxying only works for the following HTTP methods: ${[...SUPPORTED_METHODS].join(', ')}`,
      );
    }

    if (!this.wda) {
      throw new Error('Cannot call proxyCommand without WDA driver active');
    }
    const proxy = isSessionCommand ? this.wda.jwproxy : this.wda.noSessionProxy;
    if (!proxy) {
      throw new Error('Cannot call proxyCommand without WDA proxy active');
    }

    let cmdName = wdaRouteToCommandName(url, method) || routeToCommandName(url, method);
    const timeout = this._getCommandTimeout(cmdName);
    if (!cmdName) {
      // this should never happen except when adding new routes
      cmdName = 'Unknown'; // just for logging purposes below
      this.log.info(`Proxying to WDA with an unknown route: ${method} ${url}`);
    }

    if (!timeout) {
      return /** @type {TRes} */ (await proxy.command(url, method, body));
    }

    this.log.debug(`Setting custom timeout to ${timeout} ms for '${cmdName}' command`);
    try {
      return /** @type {TRes} */ (await B.resolve(proxy.command(url, method, body)).timeout(timeout));
    } catch (e) {
      if (!(e instanceof B.Promise.TimeoutError)) {
        throw e;
      }
      proxy.cancelActiveRequests();
      const error = new errors.TimeoutError(
        `Appium did not get any response from '${cmdName}' command in ${timeout} ms`
      );
      await this.startUnexpectedShutdown(error);
      throw error;
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {'GET'|'POST'|'DELETE'} AllowedHttpMethod
 */
