import {errors, routeToCommandName} from 'appium/driver';
import B from 'bluebird';
import type {XCUITestDriver} from '../driver';

const GET = 'GET';
const POST = 'POST';
const DELETE = 'DELETE';
const SUPPORTED_METHODS = Object.freeze(new Set([GET, POST, DELETE] as const));

const WDA_ROUTES = {
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
} as const;

export type AllowedHttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * Proxies a command to WebDriverAgent
 *
 * @template TReq - Request body type
 * @template TRes - Response type
 * @param url - The endpoint URL
 * @param method - HTTP method to use
 * @param body - Optional request body
 * @param isSessionCommand - Whether this is a session command (default: true)
 * @returns Promise resolving to the response
 */
export async function proxyCommand<TReq = any, TRes = unknown>(
  this: XCUITestDriver,
  url: string,
  method: AllowedHttpMethod,
  body?: TReq,
  isSessionCommand: boolean = true,
): Promise<TRes> {
  if (this.shutdownUnexpectedly) {
    return undefined as TRes;
  }

  if (!url) {
    throw this.log.errorWithException('Proxying requires an endpoint');
  } else if (!SUPPORTED_METHODS.has(method)) {
    throw this.log.errorWithException(
      `Proxying only works for the following HTTP methods: ${[...SUPPORTED_METHODS].join(', ')}`,
    );
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
    return (await proxy.command(url, method, body)) as TRes;
  }

  this.log.debug(`Setting custom timeout to ${timeout} ms for '${cmdName}' command`);
  try {
    return (await B.resolve(proxy.command(url, method, body)).timeout(timeout)) as TRes;
  } catch (e) {
    if (!(e instanceof B.Promise.TimeoutError)) {
      throw e;
    }
    proxy.cancelActiveRequests();
    const error = new errors.TimeoutError(
      `Appium did not get any response from '${cmdName}' command in ${timeout} ms`,
    );
    await this.startUnexpectedShutdown(error);
    throw error;
  }
}

function wdaRouteToCommandName(endpoint: string, method: AllowedHttpMethod): string | undefined {
  if (endpoint in WDA_ROUTES) {
    return WDA_ROUTES[endpoint as keyof typeof WDA_ROUTES]?.[method];
  }
}
