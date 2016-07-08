import { errors } from 'appium-base-driver';


let helpers = {}, extensions = {};

helpers.proxyCommand = async function (endpoint, method, body) {
  if (!endpoint) {
    throw new errors.BadParametersError('Proxying requires an endpoint');
  } else if (method !== 'POST' && method !== 'GET') {
    throw new errors.BadParametersError('Proxying only works for GET or POST requests');
  }
  return await this.wda.jwproxy.command(endpoint, method, body);
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
