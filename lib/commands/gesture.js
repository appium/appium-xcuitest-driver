import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import _ from 'lodash';
import log from '../logger';

const SUPPORTED_GESTURE_DIRECTIONS = ['up', 'down', 'left', 'right'];

const helpers = {}, extensions = {}, commands = {};

function toElementId (opts = {}) {
  if (opts.element) {
    log.info(`The 'element' argument name is deprecated. Consider using 'elementId' instead`);
  }
  const el = opts.elementId || opts.element;
  return el ? util.unwrapElement(el) : null;
}

async function toElementOrApplicationId (driver, opts = {}) {
  return toElementId(opts)
    || util.unwrapElement(await driver.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false));
}

commands.moveTo = async function moveTo (el, xoffset = 0, yoffset = 0) {
  el = util.unwrapElement(el);

  if (this.isWebContext()) {
    let {x, y} = await this.getLocation(el);
    let coords = {
      x: x + xoffset,
      y: y + yoffset
    };
    this.curWebCoords = coords;
    let atomsElement = this.getAtomsElement(el);
    let relCoords = {x: xoffset, y: yoffset};
    await this.executeAtom('move_mouse', [atomsElement, relCoords]);
  } else {
    if (_.isNil(el)) {
      if (!this.curCoords) {
        throw new errors.UnknownException(
          'Current cursor position unknown, please use moveTo with an element the first time.');
      }
      this.curCoords = {
        x: this.curCoords.x + xoffset,
        y: this.curCoords.y + yoffset
      };
    } else {
      let elPos = await this.getLocation(el);
      this.curCoords = {
        x: elPos.x + xoffset,
        y: elPos.y + yoffset
      };
    }
  }
};

function requireFloatParameter (paramName, paramValue, methodName) {
  if (_.isUndefined(paramValue)) {
    throw new errors.InvalidArgumentError(`"${paramName}" parameter is mandatory for "${methodName}" call`);
  }
  const result = parseFloat(paramValue);
  if (isNaN(result)) {
    throw new errors.InvalidArgumentError(`"${paramName}" parameter should be a valid number. "${paramValue}" is given instead`);
  }
  return result;
}

function requireIntParameter (paramName, paramValue, methodName) {
  if (_.isUndefined(paramValue)) {
    throw new errors.InvalidArgumentError(`"${paramName}" parameter is mandatory for "${methodName}" call`);
  }
  const result = parseInt(paramValue, 10);
  if (isNaN(result)) {
    throw new errors.InvalidArgumentError(`"${paramName}" parameter should be a valid integer. "${paramValue}" is given instead`);
  }
  return result;
}

commands.mobileShake = async function mobileShake () {
  if (!this.isSimulator()) {
    throw new errors.UnknownError('Shake is not supported on real devices');
  }
  await this.opts.device.shake();
};

commands.click = async function click (el) {
  if (!this.isWebContext()) {
    // there are multiple commands that map here, so manually proxy
    return await this.nativeClick(el);
  }
  el = util.unwrapElement(el);
  if ((await this.settings.getSettings()).nativeWebTap || (await this.settings.getSettings()).nativeWebTapStrict) {
    // atoms-based clicks don't always work in safari 7
    log.debug('Using native web tap');
    await this.nativeWebTap(el);
  } else {
    const atomsElement = this.getAtomsElement(el);
    return await this.executeAtom('click', [atomsElement]);
  }
};

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

commands.performActions = async function performActions (actions) {
  log.debug(`Received the following W3C actions: ${JSON.stringify(actions, null, '  ')}`);
  // This is mandatory, since WDA only supports TOUCH pointer type
  // and Selenium API uses MOUSE as the default one
  const preprocessedActions = actions
    .map((action) => Object.assign({}, action, action.type === 'pointer' ? {
      parameters: {
        pointerType: 'touch'
      }
    } : {}))
    .map((action) => {
      const modifiedAction = _.clone(action) || {};
      // Selenium API unexpectedly inserts zero pauses, which are not supported by WDA
      modifiedAction.actions = (action.actions || [])
        .filter((innerAction) => !(innerAction.type === 'pause' && innerAction.duration === 0));
      return modifiedAction;
    });
  log.debug(`Preprocessed actions: ${JSON.stringify(preprocessedActions, null, '  ')}`);
  return await this.proxyCommand('/actions', 'POST', {actions: preprocessedActions});
};

commands.releaseActions = function releaseActions () {
  log.warn('On this platform, releaseActions is a no-op');
};

commands.performTouch = async function performTouch (gestures) {
  log.debug(`Received the following touch action: ${gesturesChainToString(gestures)}`);
  try {
    return await this.proxyCommand('/wda/touch/perform', 'POST', {actions: gestures});
  } catch (e) {
    if (!this.isWebContext()) {
      throw e;
    }
    log.errorAndThrow('The Touch API is aimed for usage in NATIVE context. ' +
      'Consider using "execute" API with custom events trigger script ' +
      `to emulate touch events being in WEBVIEW context. Original error: ${e.message}`);
  }
};

commands.performMultiAction = async function performMultiAction (actions) {
  log.debug(`Received the following multi touch action:`);
  for (let i in actions) {
    log.debug(`    ${parseInt(i, 10) + 1}: ${_.map(actions[i], 'action').join('-')}`);
  }
  try {
    return await this.proxyCommand('/wda/touch/multi/perform', 'POST', {actions});
  } catch (e) {
    if (!this.isWebContext()) {
      throw e;
    }
    log.errorAndThrow('The MultiTouch API is aimed for usage in NATIVE context. ' +
      'Consider using "execute" API with custom events trigger script ' +
      `to emulate multitouch events being in WEBVIEW context. Original error: ${e.message}`);
  }
};

commands.nativeClick = async function nativeClick (el) {
  el = util.unwrapElement(el);
  let endpoint = `/element/${el}/click`;
  return await this.proxyCommand(endpoint, 'POST', {});
};

/*
 * See https://github.com/facebook/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBElementCommands.m
 * to get the info about available WDA gestures API
 *
 * See https://developer.apple.com/reference/xctest/xcuielement and
 * https://developer.apple.com/reference/xctest/xcuicoordinate to get the detailed description of
 * all XCTest gestures
*/

helpers.mobileScroll = async function mobileScroll (opts = {}) {
  // WDA supports four scrolling strategies: predication based on name, direction,
  // predicateString, and toVisible, in that order
  const {
    name,
    direction,
    predicateString,
    toVisible,
    distance,
  } = opts;
  const params = {};
  if (name) {
    params.name = name;
  } else if (direction) {
    if (!SUPPORTED_GESTURE_DIRECTIONS.includes(_.toLower(direction))) {
      throw new errors.InvalidArgumentError(`'direction' must be one of: ${SUPPORTED_GESTURE_DIRECTIONS}`);
    }
    params.direction = direction;
  } else if (predicateString) {
    params.predicateString = predicateString;
  } else if (toVisible) {
    params.toVisible = toVisible;
  } else {
    throw new errors.InvalidArgumentError(
      'Mobile scroll supports the following strategies: name, direction, predicateString, and toVisible. ' +
      'Specify one of these');
  }
  // we can also optionally pass a distance which appears to be a ratio of
  // screen height, so 1.0 means a full screen's worth of scrolling
  if (!_.isNil(distance)) {
    params.distance = distance;
  }
  const elementId = await toElementOrApplicationId(this, opts);
  return await this.proxyCommand(`/wda/element/${elementId}/scroll`, 'POST', params);
};

helpers.mobileSwipe = async function mobileSwipe (opts = {}) {
  const {
    direction,
    velocity,
  } = opts;
  if (!SUPPORTED_GESTURE_DIRECTIONS.includes(_.toLower(direction))) {
    throw new errors.InvalidArgumentError(`'direction' must be one of: ${SUPPORTED_GESTURE_DIRECTIONS}`);
  }
  const params = {direction};
  if (!_.isNil(velocity)) {
    params.velocity = velocity;
  }
  const elementId = await toElementOrApplicationId(this, opts);
  return await this.proxyCommand(`/wda/element/${elementId}/swipe`, 'POST', params);
};

helpers.mobilePinch = async function mobilePinch (opts = {}) {
  const params = {
    scale: requireFloatParameter('scale', opts.scale, 'pinch'),
    velocity: requireFloatParameter('velocity', opts.velocity, 'pinch')
  };
  const elementId = await toElementOrApplicationId(this, opts);
  return await this.proxyCommand(`/wda/element/${elementId}/pinch`, 'POST', params);
};

helpers.mobileDoubleTap = async function mobileDoubleTap (opts = {}) {
  const elementId = toElementId(opts);
  if (elementId) {
    // Double tap element
    return await this.proxyCommand(`/wda/element/${elementId}/doubleTap`, 'POST');
  }
  // Double tap coordinates
  const params = {
    x: requireFloatParameter('x', opts.x, 'doubleTap'),
    y: requireFloatParameter('y', opts.y, 'doubleTap')
  };
  return await this.proxyCommand('/wda/doubleTap', 'POST', params);
};

helpers.mobileTwoFingerTap = async function mobileTwoFingerTap (opts = {}) {
  const elementId = await toElementOrApplicationId(this, opts);
  return await this.proxyCommand(`/wda/element/${elementId}/twoFingerTap`, 'POST');
};

helpers.mobileTouchAndHold = async function mobileTouchAndHold (opts = {}) {
  const params = {
    duration: requireFloatParameter('duration', opts.duration, 'touchAndHold')
  };
  const elementId = toElementId(opts);
  if (elementId) {
    // Long tap element
    return await this.proxyCommand(`/wda/element/${elementId}/touchAndHold`, 'POST', params);
  }
  // Long tap coordinates
  params.x = requireFloatParameter('x', opts.x, 'touchAndHold');
  params.y = requireFloatParameter('y', opts.y, 'touchAndHold');
  return await this.proxyCommand('/wda/touchAndHold', 'POST', params);
};

helpers.mobileTap = async function mobileTap (opts = {}) {
  const params = {
    x: requireFloatParameter('x', opts.x, 'tap'),
    y: requireFloatParameter('y', opts.y, 'tap')
  };
  const elementId = toElementId(opts) || '0';
  return await this.proxyCommand(`/wda/tap/${elementId}`, 'POST', params);
};

helpers.mobileDragFromToForDuration = async function mobileDragFromToForDuration (opts = {}) {
  const params = {
    duration: requireFloatParameter('duration', opts.duration, 'dragFromToForDuration'),
    fromX: requireFloatParameter('fromX', opts.fromX, 'dragFromToForDuration'),
    fromY: requireFloatParameter('fromY', opts.fromY, 'dragFromToForDuration'),
    toX: requireFloatParameter('toX', opts.toX, 'dragFromToForDuration'),
    toY: requireFloatParameter('toY', opts.toY, 'dragFromToForDuration')
  };
  const elementId = toElementId(opts);
  return elementId
    // Drag element
    ? await this.proxyCommand(`/wda/element/${elementId}/dragfromtoforduration`, 'POST', params)
    // Drag coordinates
    : await this.proxyCommand('/wda/dragfromtoforduration', 'POST', params);
};

helpers.mobileTapWithNumberOfTaps = async function mobileTapWithNumberOfTaps (opts = {}) {
  const elementId = toElementId(opts);
  if (!elementId) {
    throw new errors.InvalidArgumentError('Element id is expected to be set for tapWithNumberOfTaps method');
  }
  const params = {
    numberOfTaps: requireIntParameter('numberOfTaps', opts.numberOfTaps, 'tapWithNumberOfTaps'),
    numberOfTouches: requireIntParameter('numberOfTouches', opts.numberOfTouches, 'tapWithNumberOfTaps'),
  };
  return await this.proxyCommand(`/wda/element/${elementId}/tapWithNumberOfTaps`, 'POST', params);
};

helpers.mobileSelectPickerWheelValue = async function mobileSelectPickerWheelValue (opts = {}) {
  const elementId = toElementId(opts);
  if (!elementId) {
    throw new errors.InvalidArgumentError('Element id is expected to be set for selectPickerWheelValue method');
  }
  if (!_.isString(opts.order) || !['next', 'previous'].includes(opts.order.toLowerCase())) {
    throw new errors.InvalidArgumentError(`The mandatory 'order' parameter is expected to be equal either to 'next' or 'previous'. ` +
      `'${opts.order}' is given instead`);
  }
  const params = {order: opts.order};
  if (opts.offset) {
    params.offset = requireFloatParameter('offset', opts.offset, 'selectPickerWheelValue');
  }
  return await this.proxyCommand(`/wda/pickerwheel/${elementId}/select`, 'POST', params);
};

helpers.mobileRotateElement = async function mobileRotateElement (opts = {}) {
  const elementId = toElementId(opts);
  if (!elementId) {
    throw new errors.InvalidArgumentError('Element id is expected to be set for rotateElement method');
  }
  const params = {
    rotation: requireFloatParameter('rotation', opts.rotation, 'rotateElement'),
    velocity: requireFloatParameter('velocity', opts.velocity, 'rotateElement'),
  };
  return await this.proxyCommand(`/wda/element/${elementId}/rotate`, 'POST', params);
};

helpers.getCoordinates = async function getCoordinates (gesture) {
  // defaults
  let coordinates = {x: 0, y: 0, areOffsets: false};

  let optionX = null;
  if (gesture.options.x) {
    optionX = requireFloatParameter('x', gesture.options.x, 'getCoordinates');
  }
  let optionY = null;
  if (gesture.options.y) {
    optionY = requireFloatParameter('y', gesture.options.y, 'getCoordinates');
  }

  // figure out the element coordinates.
  const elementId = toElementId(gesture.options);
  if (elementId) {
    let rect = await this.getElementRect(elementId);
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

helpers.applyMoveToOffset = function applyMoveToOffset (firstCoordinates, secondCoordinates) {
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
export { extensions, helpers, commands, gesturesChainToString };
export default extensions;
