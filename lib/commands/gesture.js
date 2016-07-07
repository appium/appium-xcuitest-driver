import { errors } from 'appium-base-driver';
import { util } from 'appium-support';


let helpers = {}, extensions = {}, commands = {};


commands.performTouch = async function (gestures) {
  if (gestures.length === 1 && gestures[0].action === 'tap') {
    return await this.handleTap(gestures[0]);
  }
  throw new errors.NotYetImplementedError('Support for gestures other than Tap is not yet implemented. Please contact an Appium dev');
};

commands.performMultiAction = async function (/*actions, elementId*/) {
  throw new errors.NotYetImplementedError('Support for multi-action API is not yet implemented. Please contact an Appium dev.');
};

helpers.handleTap = async function (gesture) {
  let options = gesture.options || {};

  let params = {};
  if (util.hasValue(options.x) && util.hasValue(options.y)) {
    params.x = options.x;
    params.y = options.y;
  }

  let endpoint = `/tap/${util.hasValue(options.element) ? options.element : '0'}`;
  return await this.proxyCommand(endpoint, 'POST', params);
};


helpers.mobileScroll = async function (opts={}) {
  // proxy scroll request
  let body = opts;
  let method = 'POST';
  let endpoint = `/uiaElement/${opts.element}/scroll`;
  return await this.proxyCommand(endpoint, method, body);
};

Object.assign(extensions, helpers, commands);
export { extensions, helpers, commands };
export default extensions;
