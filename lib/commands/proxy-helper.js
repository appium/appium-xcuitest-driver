import { errorFromCode } from 'appium-base-driver';
import log from '../logger';

const SUPPORTED_METHODS = ['POST', 'GET', 'DELETE'];

let helpers = {}, extensions = {};

helpers.proxyCommand = async function (endpoint, method, body) {
  if (!endpoint) {
    log.errorAndThrow('Proxying requires an endpoint');
  } else if (SUPPORTED_METHODS.indexOf(method) === -1) {
    log.errorAndThrow(`Proxying only works for the following requests: ${SUPPORTED_METHODS.join(', ')}`);
  }

  if (!this.wda || !this.wda.jwproxy) {
    throw new Error("Can't call proxyCommand without proxy active");
  }

  let res;
  try {
    this.isWDARequestRunning = true;
    res = await this.wda.jwproxy.command(endpoint, method, body);
  } finally {
    this.isWDARequestRunning = false;
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
