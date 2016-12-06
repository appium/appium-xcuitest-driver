import { errorFromCode } from 'appium-base-driver';
import log from '../logger';


let helpers = {}, extensions = {};

helpers.proxyCommand = async function (endpoint, method, body) {
  if (!endpoint) {
    log.errorAndThrow('Proxying requires an endpoint');
  } else if (method !== 'POST' && method !== 'GET' && method !== 'DELETE') {
    log.errorAndThrow('Proxying only works for GET, POST or DELETE requests');
  }

  if (!this.wda || !this.wda.jwproxy) {
    throw new Error("Can't call proxyCommand without proxy active");
  }

  let res = await this.wda.jwproxy.command(endpoint, method, body);

  // temporarily handle errors that can be returned
  if (res && res.status && parseInt(res.status, 10) !== 0) {
    throw errorFromCode(res.status, res.value);
  }

  return res;
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
