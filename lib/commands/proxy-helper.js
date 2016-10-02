import { errors, errorFromCode } from 'appium-base-driver';


let helpers = {}, extensions = {};

helpers.proxyCommand = async function (endpoint, method, body) {
  if (!endpoint) {
    throw new errors.BadParametersError('Proxying requires an endpoint');
  } else if (method !== 'POST' && method !== 'GET' && method !== 'DELETE') {
    throw new errors.BadParametersError('Proxying only works for GET or POST or DELETE requests');
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
