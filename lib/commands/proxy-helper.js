import { errorFromCode, errors, routeToCommandName } from 'appium-base-driver';
import log from '../logger';
import B from 'bluebird';

const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE'];
const GET_STATUS_COMMAND = 'getStatus';

let helpers = {}, extensions = {};

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
    throw new Error("Can't call proxyCommand without WDA driver active");
  }
  const proxy = isSessionCommand ? this.wda.jwproxy : this.wda.noSessionProxy;
  if (!proxy) {
    throw new Error("Can't call proxyCommand without WDA proxy active");
  }

  const cmdName = routeToCommandName(endpoint, method);
  const timeout = this._getCommandTimeout(cmdName);
  let res = null;
  if (timeout) {
    log.debug(`Setting custom timeout to ${timeout} ms for "${cmdName}" command`);
    let isCommandExpired = false;
    res = await B.Promise.resolve(proxy.command(endpoint, method, body))
                  .timeout(timeout)
                  .catch(B.Promise.TimeoutError, () => {
                    isCommandExpired = true;
                  });
    if (isCommandExpired) {
      proxy.cancelActiveRequests();
      const errMsg = `Appium did not get any response from "${cmdName}" command in ${timeout} ms`;
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

  if (res && cmdName === GET_STATUS_COMMAND) {
    this.cachedWdaStatus = res;
  }

  return res;
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
