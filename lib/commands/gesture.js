
let helpers = {}, extensions = {};

helpers.mobileScroll = async function (opts={}) {
  // proxy scroll request
  let body = opts;
  let method = 'POST';
  let endpoint = `/uiaElement/${opts.element}/scroll`;
  return await this.proxyCommand(endpoint, method, body);
};

Object.assign(extensions, helpers);
export { helpers };
export default extensions;
