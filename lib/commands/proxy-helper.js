import { errors } from 'appium-base-driver';

let helpers = {}, extensions = {};

helpers.proxyCommand = async function (endpoint, method, body) {
  if (!endpoint) {
    throw new errors.BadParametersError('s/commands/requires');
  } else if (method !== 'POST' && method !== 'GET') {
    throw new errors.BadParametersError('"POST" or "GET" Methods');
  }
  return await this.wda.jwproxy.command(endpoint, method, body);
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
