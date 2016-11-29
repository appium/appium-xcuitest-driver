import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import _ from 'lodash';
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
  log.debug(`Received the following touch action: ${_.map(gestures, 'action').join('-')}`);

  if (isDoubleTap(gestures)) {
    return await this.handleDoubleTap(gestures);
  } else if (isTap(gestures)) {
    return await this.handleTap(gestures[0]);
  } else if (isLongPress(gestures)) {
    return await this.handleLongPress(gestures);
  } else if (isDrag(gestures)) {
    return await this.handleDrag(gestures);
  } else if (isScroll(gestures)) {
    return await this.handleScroll(gestures);
  }
  throw new errors.NotYetImplementedError('Support for this gesture is not yet implemented. Please contact an Appium dev');
};

commands.performMultiAction = async function (actions) {
  log.debug(`Received the following multi touch action:`);
  for (let i in actions) {
    log.debug(`    ${i+1}: ${_.map(actions[i], 'action').join('-')}`);
  }

  if (isPinchOrZoom(actions)) {
    return await this.handlePinchOrZoom(actions);
  }
  throw new errors.NotYetImplementedError('Support for this multi-action is not yet implemented. Please contact an Appium dev.');
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

function isDoubleTap (gestures) {
  if (gestures.length === 1 && gestures[0].action.toLowerCase() === 'doubletap') {
    return true;
  } else if (gestures.length === 1 &&
             gestures[0].action === 'tap' &&
             (gestures[0].options || {}).count === 2) {
    return true;
  }
  return false;
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

function isPinchOrZoom (actions = []) {
  // symmetric two-finger action consisting of press-moveto-release
  if (actions.length === 2) {
    if (actions[0].length === 3 && actions[1].length === 3) {
      return _.every(actions, (gestures) => isScroll(gestures));
    }
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

  let el = util.hasValue(options.element) ? options.element : '0';
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

helpers.handleDoubleTap = async function (gestures) {
  let gesture = gestures[0];
  let opts = gesture.options || {};

  if (!opts.element) {
    log.errorAndThrow('WDA double tap needs an element');
  }

  let el = util.unwrapElement(opts.element);
  let endpoint = `/uiaElement/${el}/doubleTap`;

  return await this.proxyCommand(endpoint, 'POST');
};

helpers.handleLongPress = async function (gestures) {
  let pressOpts = gestures[0].options || {};

  let el = util.unwrapElement(pressOpts.element);
  let duration;
  if (gestures.length === 1 && util.hasValue(pressOpts.duration)) {
    duration = pressOpts.duration;
  } else if (gestures.length === 3) {
    // duration is the `wait` action
    // upstream system expects seconds not milliseconds
    duration = parseFloat(gestures[1].options.ms) / 1000;
  } else {
    // give a sane default duration
    duration = 0.8;
  }

  let params = {
    duration,
    x: pressOpts.x,
    y: pressOpts.y,
  };

  let endpoint;
  if (el) {
    endpoint = `/uiaElement/${el}/touchAndHold`;
  } else {
    params.x = pressOpts.x;
    params.y = pressOpts.y;

    endpoint = '/touchAndHold';
  }
  return await this.proxyCommand(endpoint, 'POST', params);
};

function determinePinchScale (x, y, pinch) {
  let scale = x > y ? x - y : y - x;
  if (pinch) {
    // TODO: revisit this when pinching actually works, since it is impossible to
    // know what the scale factor does at this point (Xcode 8.1)
    scale = 1 / scale;
    if (scale < 0.02) {
      // this is the minimum that Apple will allow
      // but WDA will not throw an error if it is too low
      scale = 0.02;
    }
  } else {
    // for zoom, each 10px is one scale factor
    scale = scale / 10;
  }
  return scale;
}

helpers.handlePinchOrZoom = async function (actions) {
  // currently we can only do this action on an element
  if (!actions[0][0].options.element ||
      actions[0][0].options.element !== actions[1][0].options.element) {
    log.errorAndThrow('Pinch/zoom actions must be done on a single element');
  }
  let el = actions[0][0].options.element;

  // assume that action is in a single plane (x or y, not horizontal at all)
  // terminology all assuming right handedness
  let scale, velocity;
  if (actions[0][0].options.y === actions[0][1].options.y) {
    // horizontal, since y offset is the same in press and moveTo
    let thumb = (actions[0][0].options.x <= actions[1][0].options.x) ? actions[0] : actions[1];

    // now decipher pinch vs. zoom,
    //   pinch: thumb moving from left to right
    //   zoom: thumb moving from right to left
    scale = determinePinchScale(thumb[0].options.x, thumb[1].options.x, thumb[0].options.x <= thumb[1].options.x);
  } else {
    // vertical
    let forefinger = (actions[0][0].options.y <= actions[1][0].options.y) ? actions[0] : actions[1];

    // now decipher pinch vs. zoom
    //   pinch: forefinger moving from top to bottom
    //   zoom: forefinger moving from bottom to top
    scale = determinePinchScale(forefinger[0].options.y, forefinger[1].options.y, forefinger[0].options.y <= forefinger[1].options.y);
  }
  velocity = scale < 1 ? -1 : 1;

  log.debug(`Decoded ${scale < 1 ? 'pinch' : 'zoom'} action with scale '${scale}' and velocity '${velocity}'`);
  if (scale < 1) {
    log.warn('Pinch actions may not work, due to Apple issue.');
  }

  let params = {
    scale,
    velocity
  };
  await this.proxyCommand(`/element/${el}/pinch`, 'POST', params);
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
