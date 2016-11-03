import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import log from '../logger';


let helpers = {}, extensions = {}, commands = {};

commands.moveTo = iosCommands.gesture.moveTo;

commands.click = async function (el) {
  if (!this.isWebContext()) {
    throw new errors.UnknownError('Command should be proxied to WDA');
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
  if (isTap(gestures)) {
    return await this.handleTap(gestures[0]);
  } else if (gestures.length === 1 && (gestures[0] || '').action.toLowerCase() === 'doubletap') {
    return await this.handleDoubleTap(gestures[0]);
  } else if (isLongPress(gestures)) {
    return await this.handleLongPress(gestures);
  } else if (isDrag(gestures)) {
    return await this.handleDrag(gestures);
  } else if (isScroll(gestures)) {
    return await this.handleScroll(gestures);
  }
  throw new errors.NotYetImplementedError('Support for gestures other than Tap is not yet implemented. Please contact an Appium dev');
};

commands.performMultiAction = async function (/*actions, elementId*/) {
  throw new errors.NotYetImplementedError('Support for multi-action API is not yet implemented. Please contact an Appium dev.');
};

commands.nativeClick = async function (el) {
  el = util.unwrapElement(el);
  let endpoint = `/element/${el}/click`;
  return await this.proxyCommand(endpoint, 'POST', {});
};

function isDrag (gestures) {
  return (
      gestures.length === 4 &&
      gestures[0].action === 'press' &&
      gestures[1].action === 'wait' &&
      gestures[2].action === 'moveTo' &&
      gestures[3].action === 'release'
  );
}

function isTap (gestures) {
  if (gestures.length === 1 && gestures[0].action === 'tap') {
    return true;
  } else if (gestures.length === 2 &&
              gestures[0].action === 'press' &&
              gestures[1].action === 'release') {
    return true;
  }
  return false;
}

function isLongPress (gestures) {
  if (gestures.length === 1 && gestures[0].action.toLowerCase() === 'longpress') {
    return true;
  } else if (gestures.length === 3 &&
              gestures[0].action === 'press' &&
              gestures[1].action === 'wait' &&
              gestures[2].action === 'release') {
    return true;
  }
  return false;
}

function isScroll (gestures) {
  if (gestures.length === 3 &&
        gestures[0].action === 'press' &&
        gestures[1].action === 'moveTo' &&
        gestures[2].action === 'release') {
    return true;
  }
  return false;
}

helpers.handleScroll = async function (gestures) {
  if (gestures[1].options.element) {
    // use the to-visible option of scrolling in WDA
    return await this.mobileScroll({
      element: gestures[1].options.element,
      toVisible: true
    });
  }

  // otherwise, for now, just translate into a drag with short duration
  let dragGestures = [
    gestures[0],
    {action: 'wait', options: {ms: 0}},
    gestures[1],
    gestures[2]
  ];
  return await this.handleDrag(dragGestures);
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

  let el = util.hasValue(options.element) ? options.element : '';
  let endpoint = `/tap/${el}`;

  if (util.hasValue(this.opts.tapWithShortPressDuration)) {
    // in some cases `tap` is too slow, so allow configurable long press
    log.debug(`Translating tap into long press with '${this.opts.tapWithShortPressDuration}' duration`);
    params.duration = parseFloat(this.opts.tapWithShortPressDuration);
    endpoint = `/uiaElement/${el}/touchAndHold`;
    params.duration = parseFloat(this.opts.tapWithShortPressDuration);
  }

  return await this.proxyCommand(endpoint, 'POST', params);
};

helpers.handleDoubleTap = async function (gesture) {
  let opts = gesture.options || {};

  if (!opts.element) {
    log.errorAndThrow('WDA double tap needs an element');
  }

  let el = opts.element.ELEMENT ? opts.element.ELEMENT : opts.element;
  let endpoint = `/uiaElement/${el}/doubleTap`;

  return await this.proxyCommand(endpoint, 'POST');
};

helpers.handleLongPress = async function (gestures) {
  let pressOpts = gestures[0].options || {};

  let el = util.unwrapElement(pressOpts.element);
  if (!el) {
    log.errorAndThrow('WDA long press needs an element');
  }

  let duration = 0.8;
  if (gestures.length === 1 && util.hasValue(pressOpts.duration)) {
    duration = pressOpts.duration;
  } else if (gestures.length === 3) {
    // duration is the `wait` action
    // upstream system expects seconds not milliseconds
    duration = parseFloat(gestures[1].options.ms) / 1000;
  }

  let params = {
    duration,
    x: pressOpts.x,
    y: pressOpts.y,
  };

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
    log.errorAndThrow(msg);
  }

  let element = opts.element.ELEMENT ? opts.element.ELEMENT : opts.element;
  let endpoint = `/uiaElement/${element}/scroll`;
  return await this.proxyCommand(endpoint, 'POST', params);
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
