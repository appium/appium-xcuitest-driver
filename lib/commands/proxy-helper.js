import { errorFromCode, errors, routeToCommandName } from 'appium-base-driver';
import log from '../logger';
import B from 'bluebird';


const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE'];

let helpers = {}, extensions = {};


function wdaRouteToCommandName (endpoint, method) {
  let commandName;
  switch (endpoint) {
    case '/wda/touch/perform':
      if (method === 'POST') {
        commandName = 'performTouch';
      }
      break;
  }
  return commandName;
}

helpers.proxyCommand = async function (endpoint, method, body, isSessionCommand = true) {
  if (this.shutdownUnexpectedly) {
    return;
  }

  if (!endpoint) {
    log.errorAndThrow('Proxying requires an endpoint');
  } else if (SUPPORTED_METHODS.indexOf(method) === -1) {
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
    log.warn(`Proxying to WDA with an unknown route: ${method}:${endpoint}`);
  }

  let res = null;
  if (timeout) {
    log.debug(`Setting custom timeout to ${timeout} ms for '${cmdName}' command`);
    let isCommandExpired = false;
    res = await B.resolve(proxy.command(endpoint, method, body))
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
  } else {
    res = await proxy.command(endpoint, method, body);
  }

  // temporarily handle errors that can be returned
  if (res && res.status && parseInt(res.status, 10) !== 0) {
    throw errorFromCode(res.status, res.value);
  }

  return res;
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
