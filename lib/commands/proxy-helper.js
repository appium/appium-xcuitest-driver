import { errorFromCode, errors, routeToCommandName } from 'appium-base-driver';
import log from '../logger';
import B from 'bluebird';

const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE'];

let helpers = {}, extensions = {};

helpers.proxyCommand = async function (endpoint, method, body) {
  if (this.shutdownUnexpectedly) return;

  if (!endpoint) {
    log.errorAndThrow('Proxying requires an endpoint');
  } else if (SUPPORTED_METHODS.indexOf(method) === -1) {
    log.errorAndThrow(`Proxying only works for the following requests: ${SUPPORTED_METHODS.join(', ')}`);
  }

  if (!this.wda || !this.wda.jwproxy) {
    throw new Error("Can't call proxyCommand without proxy active");
  }

  const cmdName = routeToCommandName(endpoint, method);
  const timeout = this._getCommandTimeout(cmdName);
  let res = null;
  if (timeout) {
    log.debug(`Setting custom timeout to ${timeout} ms for "${cmdName}" command`);
    let isCommandExpired = false;
    try {
      this.isWDARequestRunning = true;
      res = await B.Promise.resolve(this.wda.jwproxy.command(endpoint, method, body))
                    .timeout(timeout)
                    .catch(B.Promise.TimeoutError, () => {
                      isCommandExpired = true;
                    });
    } finally {
      this.isWDARequestRunning = false;
    }
    if (isCommandExpired) {
      const errMsg = `Appium did not get any response from "${cmdName}" command in ${timeout} ms`;
      await this.startUnexpectedShutdown(new errors.TimeoutError(errMsg));
      log.errorAndThrow(errMsg);
    }
  } else {
    try {
      this.isWDARequestRunning = true;
      res = await this.wda.jwproxy.command(endpoint, method, body);
    } finally {
      this.isWDARequestRunning = false;
    }
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
