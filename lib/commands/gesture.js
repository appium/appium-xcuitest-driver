import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import { retryInterval } from 'asyncbox';


let helpers = {}, extensions = {}, commands = {};

commands.moveTo = iosCommands.gesture.moveTo;

commands.click = async function (el) {
  if (!this.isWebContext()) {
    return await this.nativeClick(el);
  }
  el = util.unwrapElement(el);
  if (this.opts.nativeWebTap && !this.isRealDevice()) {
    // atoms-based clicks don't always work in safari 7
    await this.nativeWebTap(el);
  } else {
    let atomsElement = this.useAtomsElement(el);
    return await this.executeAtom('click', [atomsElement]);
  }
};

commands.performTouch = async function (gestures) {
  if (this.isTap(gestures)) {
    return await this.handleTap(gestures[0]);
  } else if (gestures.length === 1 && (gestures[0] || '').action.toLowerCase() === 'doubletap') {
    return await this.handleDoubleTap(gestures[0]);
  } else if (gestures.length === 1 && (gestures[0] || '').action.toLowerCase() === 'longpress') {
    return await this.handleLongPress(gestures[0]);
  } else if (this.isDrag(gestures)) {
    return await this.handleDrag(gestures);
  }
  throw new errors.NotYetImplementedError('Support for gestures other than Tap is not yet implemented. Please contact an Appium dev');
};

commands.performMultiAction = async function (/*actions, elementId*/) {
  throw new errors.NotYetImplementedError('Support for multi-action API is not yet implemented. Please contact an Appium dev.');
};

helpers.isDrag = function (gestures) {
  return (
      gestures.length === 4 &&
      gestures[0].action === 'press' &&
      gestures[1].action === 'wait' &&
      gestures[2].action === 'moveTo' &&
      gestures[3].action === 'release'
  );
};

helpers.isTap = function (gestures) {
  return (
    (gestures.length === 3 &&
      gestures[0].action === 'press' &&
      gestures[1].action === 'wait' &&
      gestures[2].action === 'release') ||
      (gestures.length === 1 && gestures[0].action === 'tap')
  );
};

helpers.handleDrag = async function (gestures) {
  // get gestures
  let press = gestures[0];
  let wait = gestures[1];
  let moveTo = gestures[2];

  // get drag data
  let pressCoordinates = await this.getCoordinates(press);
  let duration = (parseInt(wait.options.ms, 10) / 1000);
  let moveToCoordinates = await this.getCoordinates(moveTo);

  // update moveTo coordinates with offset
  moveToCoordinates = this.applyMoveToOffset(pressCoordinates, moveToCoordinates);

  // build drag command
  let params = {};
  params.fromX = pressCoordinates.x;
  params.fromY = pressCoordinates.y;
  params.toX = moveToCoordinates.x;
  params.toY = moveToCoordinates.y;
  params.duration = duration;

  let endpoint = `/uiaTarget/0/dragfromtoforduration`;
  return await this.proxyCommand(endpoint, 'POST', params);
};

helpers.handleTap = async function (gesture) {
  let options = gesture.options || {};

  let params = {};
  if (util.hasValue(options.x) && util.hasValue(options.y)) {
    params.x = options.x;
    params.y = options.y;
  }

  let el = util.hasValue(options.element) ? options.element : '0';
  let endpoint = `/tap/${el}`;

  return await this.proxyCommand(endpoint, 'POST', params);
};

helpers.handleDoubleTap = async function (gesture) {
  let opts = gesture.options || {};

  if (!opts.element) {
    throw new errors.BadParametersError('WDA double tap needs an element');
  }

  let el = opts.element.ELEMENT ? opts.element.ELEMENT : opts.element;
  let endpoint = `/uiaElement/${el}/doubleTap`;

  return await this.proxyCommand(endpoint, 'POST');
};

helpers.handleLongPress = async function (gesture) {
  let opts = gesture.options || {};

  if (!opts.element) {
    throw new errors.BadParametersError('WDA long press needs an element');
  }

  let el = opts.element.ELEMENT ? opts.element.ELEMENT : opts.element;
  let endpoint = `/uiaElement/${el}/doubleTap`;

  return await this.proxyCommand(endpoint, 'POST');
};

helpers.handleLongPress = async function (gesture) {
  let opts = gesture.options || {};

  if (!opts.element) {
    throw new errors.BadParametersError('WDA long press needs an element');
  }

  let params = {};
  //client don't send this today but we need to have some value here. So , 0.8 seconds going to be default duration of long press.
  let duration = opts.duration ? opts.duration : `0.8`;
  params.duration = duration;

  let el = opts.element.ELEMENT ? opts.element.ELEMENT : opts.element;
  let endpoint = `/uiaElement/${el}/touchAndHold`;

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

// This should be done in WDA. There is PR in progress for this. Once that is done this will be removed.
commands.nativeClick = async function (el) {
  let application;
  let scrollIntoView = async () => {
    let params = { toVisible: true, element : el };
    let response = await this.mobileScroll(params);
    if (response && response.status !== 0 && response.value && response.value.indexOf("Failed to perform scroll") > -1) {
      if (!application) {
        application = await this.findElement(`class name`, `XCUIElementTypeApplication`);
      }
      let locEndpoint = `/element/${el}/location`;
      let locResponse =  await this.proxyCommand(locEndpoint, 'GET', {});
      let directionVal = `down`;
      if (locResponse.y < 0) {
        directionVal = `up`;
      }
      params = { direction: directionVal, element : application };
      await this.mobileScroll(params);
      throw new Error(`could not scroll into view`);
    }
  };
  await retryInterval(5, 1, scrollIntoView);
  let endpoint = `/element/${el}/click`;
  return await this.proxyCommand(endpoint, 'POST', {});
};

helpers.getCoordinates = async function(gesture) {
  let el = gesture.options.element;

  // defaults
  let coordinates = {x: 0, y: 0, areOffsets: false};

  // figure out the element coordinates.
  if (el) {
    let rect = await this.getRect(el);
    let pos = {x: rect.x, y: rect.y};
    let size = {w: rect.width, h: rect.height};

    // defaults
    let offsetX = 0;
    let offsetY = 0;

    // get the real offsets
    if (gesture.options.x || gesture.options.y) {
      offsetX = (gesture.options.x || 0);
      offsetY = (gesture.options.y || 0);
    } else {
      offsetX = (size.w / 2);
      offsetY = (size.h / 2);
    }

    // apply the offsets
    coordinates.x = pos.x + offsetX;
    coordinates.y = pos.y + offsetY;
  } else {
    // moveTo coordinates are passed in as offsets
    coordinates.areOffsets = (gesture.action === 'moveTo');
    coordinates.x = (gesture.options.x || 0);
    coordinates.y = (gesture.options.y || 0);
  }
  return coordinates;
};

helpers.applyMoveToOffset = function (firstCoordinates, secondCoordinates) {
  if (secondCoordinates.areOffsets) {
    return {
      x: firstCoordinates.x + secondCoordinates.x,
      y: firstCoordinates.y + secondCoordinates.y,
    };
  } else {
    return secondCoordinates;
  }
};

Object.assign(extensions, helpers, commands);
export { extensions, helpers, commands };
export default extensions;
