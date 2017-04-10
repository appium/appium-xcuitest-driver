import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import _ from 'lodash';
import log from '../logger';


let helpers = {}, extensions = {}, commands = {};

commands.moveTo = iosCommands.gesture.moveTo;

commands.click = async function (el) {
  if (!this.isWebContext()) {
    // there are multiple commands that map here, so manually proxy
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

function isSameGestures (gestures, candidates) {
  try {
    if (gestures.length !== candidates.length) {
      return false;
    }
    for (let i = 0; i < gestures.length; i++) {
      const gestureObj = gestures[i];
      const candidateObj = candidates[i];
      if (!_.isPlainObject(gestureObj) || !_.isPlainObject(candidateObj)) {
        return false;
      }
      if (_.difference(_.keys(candidateObj), _.keys(gestureObj)).length) {
        return false;
      }
      if (gestureObj.action.toLowerCase() !== candidateObj.action.toLowerCase()) {
        return false;
      }
      if (candidateObj.options && gestureObj.options.count !== candidateObj.options.count) {
        return false;
      }
    }
  } catch (err) {
    log.debug(`Error "${err.message}" while comparing gestures. Considering them as not equal`);
    return false;
  }
  return true;
}

function gesturesChainToString (gestures, keysToInclude = ['options']) {
  return gestures.map((item) => {
    let otherKeys = _.difference(_.keys(item), ['action']);
    otherKeys = _.isArray(keysToInclude) ? _.intersection(otherKeys, keysToInclude) : otherKeys;
    if (otherKeys.length) {
      return `${item.action}` +
        `(${_.map(otherKeys, (x) => x + '=' + (_.isPlainObject(item[x]) ? JSON.stringify(item[x]) : item[x])).join(', ')})`;
    }
    return item.action;
  }).join('-');
}

commands.performTouch = async function (gestures) {
  log.debug(`Received the following touch action: ${gesturesChainToString(gestures)}`);

  const supportedGesturesMapping = {
    doubleTap: {
      handler: async (x) => {await this.handleDoubleTap(x);},
      matches: [
        [{action: 'doubletap'}],
        [{action: 'tap', options: {count: 2}}]
      ]
    },
    tap: {
      handler: async (x) => {await this.handleTap(x[0]);},
      matches: [
        [{action: 'tap'}],
        [{action: 'tap'}, {action: 'release'}],
        [{action: 'press'}, {action: 'release'}]
      ]
    },
    longPress: {
      handler: async (x) => {await this.handleLongPress(x);},
      matches: [
        [{action: 'longpress'}],
        [{action: 'press'}, {action: 'wait'}, {action: 'release'}]
      ]
    },
    drag: {
      handler: async (x) => {await this.handleDrag(x);},
      matches: [
        [{action: 'press'}, {action: 'wait'}, {action: 'moveTo'}, {action: 'release'}]
      ]
    },
    scroll: {
      handler: async (x) => {await this.handleScroll(x);},
      matches: [
        [{action: 'press'}, {action: 'moveTo'}, {action: 'release'}]
      ]
    }
  };
  for (let [cmd, info] of _.toPairs(supportedGesturesMapping)) {
    for (let candidateMatch of info.matches) {
      if (isSameGestures(gestures, candidateMatch)) {
        log.debug(`Found matching gesture: ${cmd}`);
        return await info.handler(gestures);
      }
    }
  }

  let availableGestures = '';
  for (let [cmd, info] of _.toPairs(supportedGesturesMapping)) {
    availableGestures += `\t${cmd}: `;
    for (let candidateMatch of info.matches) {
      availableGestures += `\t\t${gesturesChainToString(candidateMatch)}\n`;
    }
  }
  throw new errors.NotYetImplementedError(`Support for ${gesturesChainToString(gestures)} gesture is not implemented. ` +
                                          `Try to use "mobile: *" interface to workaround the issue. ` +
                                          `Only these gestures are supported:\n${availableGestures}`);
};

commands.performMultiAction = async function (actions) {
  log.debug(`Received the following multi touch action:`);
  for (let i in actions) {
    log.debug(`    ${i+1}: ${_.map(actions[i], 'action').join('-')}`);
  }

  if (isPinchOrZoom(actions)) {
    return await this.handlePinchOrZoom(actions);
  }
  throw new errors.NotYetImplementedError('Support for this multi-action is not implemented. Try to use "mobile: *" interface to workaround the issue.');
};

commands.nativeClick = async function (el) {
  el = util.unwrapElement(el);
  let endpoint = `/element/${el}/click`;
  return await this.proxyCommand(endpoint, 'POST', {});
};

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

  let endpoint = `/wda/dragfromtoforduration`;
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
  let endpoint = `/wda/tap/${el}`;

  if (util.hasValue(this.opts.tapWithShortPressDuration)) {
    // in some cases `tap` is too slow, so allow configurable long press
    log.debug(`Translating tap into long press with '${this.opts.tapWithShortPressDuration}' duration`);
    params.duration = parseFloat(this.opts.tapWithShortPressDuration);
    endpoint = `/wda/element/${el}/touchAndHold`;
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
  let endpoint = `/wda/element/${el}/doubleTap`;

  return await this.proxyCommand(endpoint, 'POST');
};

helpers.handleLongPress = async function (gestures) {
  let pressOpts = gestures[0].options || {};

  let el = util.unwrapElement(pressOpts.element);
  let duration; // In seconds (not milliseconds)
  if (gestures.length === 1 && util.hasValue(pressOpts.duration)) {
    duration = pressOpts.duration / 1000;
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
    endpoint = `/wda/element/${el}/touchAndHold`;
  } else {
    params.x = pressOpts.x;
    params.y = pressOpts.y;

    endpoint = '/wda/touchAndHold';
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
  await this.proxyCommand(`/wda/element/${el}/pinch`, 'POST', params);
};

/*
 * See https://github.com/facebook/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBElementCommands.m
 * to get the info about available WDA gestures API
 *
 * See https://developer.apple.com/reference/xctest/xcuielement and
 * https://developer.apple.com/reference/xctest/xcuicoordinate to get the detailed description of
 * all XCTest gestures
*/

helpers.mobileScroll = async function (opts={}, swipe=false) {
  if (!opts.element) {
    opts.element = await this.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false);
  }
  // WDA supports four scrolling strategies: predication based on name, direction,
  // predicateString, and toVisible, in that order. Swiping requires direction.
  let params = {};
  if (opts.name && !swipe) {
    params.name = opts.name;
  } else if (opts.direction) {
    if (['up', 'down', 'left', 'right'].indexOf(opts.direction.toLowerCase()) < 0) {
      let msg = 'Direction must be up, down, left or right';
      log.errorAndThrow(msg);
    }
    params.direction = opts.direction;
  }  else if (opts.predicateString && !swipe) {
    params.predicateString = opts.predicateString;
  } else if (opts.toVisible && !swipe) {
    params.toVisible = opts.toVisible;
  } else {
    let msg = swipe ? 'Mobile swipe requires direction' :  'Mobile scroll supports the following strategies: name, direction, predicateString, and toVisible. Specify one of these';
    log.errorAndThrow(msg);
  }

  let element = opts.element.ELEMENT || opts.element;
  let endpoint = `/wda/element/${element}/${swipe ? 'swipe' : 'scroll'}`;
  return await this.proxyCommand(endpoint, 'POST', params);
};

function parseFloatParameter (paramName, paramValue, methodName) {
  if (_.isUndefined(paramValue)) {
    log.errorAndThrow(`"${paramName}" parameter is mandatory for "${methodName}" call`);
  }
  const result = parseFloat(paramValue);
  if (isNaN(result)) {
    log.errorAndThrow(`"${paramName}" parameter should be a valid number. "${paramValue}" is given instead`);
  }
  return result;
}

helpers.mobilePinch = async function (opts={}) {
  if (!opts.element) {
    opts.element = await this.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false);
  }
  const params = {
    scale: parseFloatParameter('scale', opts.scale, 'pinch'),
    velocity: parseFloatParameter('velocity', opts.velocity, 'pinch')
  };
  const el = opts.element.ELEMENT || opts.element;
  return await this.proxyCommand(`/wda/element/${el}/pinch`, 'POST', params);
};

helpers.mobileDoubleTap = async function (opts={}) {
  if (opts.element) {
    // Double tap element
    const el = opts.element.ELEMENT || opts.element;
    return await this.proxyCommand(`/wda/element/${el}/doubleTap`, 'POST');
  }
  // Double tap coordinates
  const params = {
    x: parseFloatParameter('x', opts.x, 'doubleTap'),
    y: parseFloatParameter('y', opts.y, 'doubleTap')
  };
  return await this.proxyCommand('/wda/doubleTap', 'POST', params);
};

helpers.mobileTwoFingerTap = async function (opts={}) {
  if (!opts.element) {
    opts.element = await this.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false);
  }
  const el = opts.element.ELEMENT || opts.element;
  return await this.proxyCommand(`/wda/element/${el}/twoFingerTap`, 'POST');
};

helpers.mobileTouchAndHold = async function (opts={}) {
  let params = {
    duration: parseFloatParameter('duration', opts.duration, 'touchAndHold')
  };
  if (opts.element) {
    // Long tap element
    const el = opts.element.ELEMENT || opts.element;
    return await this.proxyCommand(`/wda/element/${el}/touchAndHold`, 'POST', params);
  }
  // Long tap coordinates
  params.x = parseFloatParameter('x', opts.x, 'touchAndHold');
  params.y = parseFloatParameter('y', opts.y, 'touchAndHold');
  return await this.proxyCommand('/wda/touchAndHold', 'POST', params);
};

helpers.mobileTap = async function (opts={}) {
  const params = {
    x: parseFloatParameter('x', opts.x, 'tap'),
    y: parseFloatParameter('y', opts.y, 'tap')
  };
  const el = opts.element ? (opts.element.ELEMENT || opts.element) : '0';
  return await this.proxyCommand(`/wda/tap/${el}`, 'POST', params);
};

helpers.mobileDragFromToForDuration = async function (opts={}) {
  const params = {
    duration: parseFloatParameter('duration', opts.duration, 'dragFromToForDuration'),
    fromX: parseFloatParameter('fromX', opts.fromX, 'dragFromToForDuration'),
    fromY: parseFloatParameter('fromY', opts.fromY, 'dragFromToForDuration'),
    toX: parseFloatParameter('toX', opts.toX, 'dragFromToForDuration'),
    toY: parseFloatParameter('toY', opts.toY, 'dragFromToForDuration')
  };
  if (opts.element) {
    // Drag element
    const el = opts.element.ELEMENT || opts.element;
    return await this.proxyCommand(`/wda/element/${el}/dragfromtoforduration`, 'POST', params);
  }
  // Drag coordinates
  return await this.proxyCommand('/wda/dragfromtoforduration', 'POST', params);
};

helpers.getCoordinates = async function (gesture) {
  let el = gesture.options.element;

  // defaults
  let coordinates = {x: 0, y: 0, areOffsets: false};

  let optionX = null;
  if (gesture.options.x) {
    optionX = parseFloatParameter('x', gesture.options.x, 'getCoordinates');
  }
  let optionY = null;
  if (gesture.options.y) {
    optionY = parseFloatParameter('y', gesture.options.y, 'getCoordinates');
  }

  // figure out the element coordinates.
  if (el) {
    let rect = await this.getRect(el);
    let pos = {x: rect.x, y: rect.y};
    let size = {w: rect.width, h: rect.height};

    // defaults
    let offsetX = 0;
    let offsetY = 0;

    // get the real offsets
    if (optionX || optionY) {
      offsetX = (optionX || 0);
      offsetY = (optionY || 0);
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
    coordinates.x = (optionX || 0);
    coordinates.y = (optionY || 0);
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
export { extensions, helpers, commands, isSameGestures, gesturesChainToString };
export default extensions;
