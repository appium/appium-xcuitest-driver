import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { retryInterval } from 'asyncbox';

let helpers = {}, extensions = {}, commands = {};

commands.click = async function (el) {
  let application;
  let scrollIntoView = async () => {
    let endpoint = `/element/${el}/location_in_view`;
    let response = await this.proxyCommand(endpoint, 'GET');
    if (response && response.status !== 0 && response.value && response.value.indexOf("Failed to perform scroll") > -1) {
      if (!application) {
        application = await this.findElement(`class name`, `XCUIElementTypeApplication`);
      }
      let params = { direction: `down`, element : application };
      await this.mobileScroll(params);
      throw new Error(`could not scroll into view`);
    }
  };
  await retryInterval(5, 1, scrollIntoView);
  let endpoint = `/element/${el}/click`;
  return await this.proxyCommand(endpoint, 'POST', {});
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
    throw new errors.BadParametersError('Mobile scroll needs an element');
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
