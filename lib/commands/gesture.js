import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import { unwrapEl } from '../utils';


let helpers = {}, extensions = {}, commands = {};

commands.moveTo = iosCommands.gesture.moveTo;

commands.click = async function (el) {
  if (!this.isWebContext()) {
    throw new errors.UnknownError('Command should be proxied to WDA');
  }
  el = unwrapEl(el);
  if (this.opts.nativeWebTap && !this.isRealDevice()) {
    // atoms-based clicks don't always work in safari 7
    await this.nativeWebTap(el);
  } else {
    let atomsElement = this.useAtomsElement(el);
    return await this.executeAtom('click', [atomsElement]);
  }
};

commands.performTouch = async function (gestures) {
  if (gestures.length === 1 && (gestures[0].action === 'tap' || gestures[0].action === 'doubleTap')) {
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

  let endpoint;
  let el = util.hasValue(options.element) ? options.element : '0';
  if (gesture.action === 'tap') {
    endpoint = `/${gesture.action}/${el}`;
  } else {
    endpoint = `/uiaElement/${el}/${gesture.action}`;
  }
  return await this.proxyCommand(endpoint, 'POST', params);
};

helpers.mobileScroll = async function (opts={}) {
  if (!opts.element) {
    opts.element = await this.findElement(`class name`, `XCUIElementTypeApplication`);
  }
  // WDA supports four scrolling strategies: predication based on name, direction,
  // predicateString, and toVisible, in that order.
  let params = {};
  if (opts.name) {
    params.name = opts.name;
  } else if (opts.direction) {
    params.direction = opts.direction;
  } else if (opts.predicateString) {
    params.predicateString = opts.predicateString;
  } else if (opts.toVisible) {
    params.toVisible = opts.toVisible;
  } else {
    let msg = 'Mobile scroll supports the following strategies: name, ' +
              'direction, predicateString, and toVisible. Specify one of these';
    throw new errors.BadParametersError(msg);
  }

  let element = opts.element.ELEMENT ? opts.element.ELEMENT : opts.element;
  let endpoint = `/uiaElement/${element}/scroll`;
  return await this.proxyCommand(endpoint, 'POST', params);
};

Object.assign(extensions, helpers, commands);
export { extensions, helpers, commands };
export default extensions;
