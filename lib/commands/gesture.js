import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import { iosCommands } from 'appium-ios-driver';
import _ from 'lodash';
import log from '../logger';


let helpers = {}, extensions = {}, commands = {};

commands.moveTo = iosCommands.gesture.moveTo;

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
  if ((await this.settings.getSettings()).nativeWebTap) {
    // atoms-based clicks don't always work in safari 7
    log.debug('Using native web tap');
    await this.nativeWebTap(el);
  } else {
    let atomsElement = this.useAtomsElement(el);
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

helpers.mobileScroll = async function mobileScroll (opts = {}, swipe = false) {
  if (!opts.element) {
    opts.element = await this.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false);
  }
  // WDA supports four scrolling strategies: predication based on name, direction,
  // predicateString, and toVisible, in that order. Swiping requires direction.
  let params = {};
  if (opts.name && !swipe) {
    params.name = opts.name;
  } else if (opts.direction) {
    if (!['up', 'down', 'left', 'right'].includes(opts.direction.toLowerCase())) {
      let msg = 'Direction must be up, down, left or right';
      log.errorAndThrow(msg);
    }
    params.direction = opts.direction;
  } else if (opts.predicateString && !swipe) {
    params.predicateString = opts.predicateString;
  } else if (opts.toVisible && !swipe) {
    params.toVisible = opts.toVisible;
  } else {
    let msg = swipe
      ? 'Mobile swipe requires direction'
      : 'Mobile scroll supports the following strategies: name, direction, predicateString, and toVisible. Specify one of these';
    log.errorAndThrow(msg);
  }

  // we can also optionally pass a distance which appears to be a ratio of
  // screen height, so 1.0 means a full screen's worth of scrolling
  if (!swipe && opts.distance) {
    params.distance = opts.distance;
  }

  let element = util.unwrapElement(opts.element);
  let endpoint = `/wda/element/${element}/${swipe ? 'swipe' : 'scroll'}`;
  return await this.proxyCommand(endpoint, 'POST', params);
};

helpers.mobileSwipe = async function mobileSwipe (opts = {}) {
  return await this.mobileScroll(opts, true);
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

helpers.mobilePinch = async function mobilePinch (opts = {}) {
  if (!opts.element) {
    opts.element = await this.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false);
  }
  const params = {
    scale: parseFloatParameter('scale', opts.scale, 'pinch'),
    velocity: parseFloatParameter('velocity', opts.velocity, 'pinch')
  };
  const el = util.unwrapElement(opts.element);
  return await this.proxyCommand(`/wda/element/${el}/pinch`, 'POST', params);
};

helpers.mobileDoubleTap = async function mobileDoubleTap (opts = {}) {
  if (opts.element) {
    // Double tap element
    const el = util.unwrapElement(opts.element);
    return await this.proxyCommand(`/wda/element/${el}/doubleTap`, 'POST');
  }
  // Double tap coordinates
  const params = {
    x: parseFloatParameter('x', opts.x, 'doubleTap'),
    y: parseFloatParameter('y', opts.y, 'doubleTap')
  };
  return await this.proxyCommand('/wda/doubleTap', 'POST', params);
};

helpers.mobileTwoFingerTap = async function mobileTwoFingerTap (opts = {}) {
  if (!opts.element) {
    opts.element = await this.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false);
  }
  const el = util.unwrapElement(opts.element);
  return await this.proxyCommand(`/wda/element/${el}/twoFingerTap`, 'POST');
};

helpers.mobileTouchAndHold = async function mobileTouchAndHold (opts = {}) {
  let params = {
    duration: parseFloatParameter('duration', opts.duration, 'touchAndHold')
  };
  if (opts.element) {
    // Long tap element
    const el = util.unwrapElement(opts.element);
    return await this.proxyCommand(`/wda/element/${el}/touchAndHold`, 'POST', params);
  }
  // Long tap coordinates
  params.x = parseFloatParameter('x', opts.x, 'touchAndHold');
  params.y = parseFloatParameter('y', opts.y, 'touchAndHold');
  return await this.proxyCommand('/wda/touchAndHold', 'POST', params);
};

helpers.mobileTap = async function mobileTap (opts = {}) {
  const params = {
    x: parseFloatParameter('x', opts.x, 'tap'),
    y: parseFloatParameter('y', opts.y, 'tap')
  };
  const el = opts.element ? (util.unwrapElement(opts.element)) : '0';
  return await this.proxyCommand(`/wda/tap/${el}`, 'POST', params);
};

helpers.mobileDragFromToForDuration = async function mobileDragFromToForDuration (opts = {}) {
  const params = {
    duration: parseFloatParameter('duration', opts.duration, 'dragFromToForDuration'),
    fromX: parseFloatParameter('fromX', opts.fromX, 'dragFromToForDuration'),
    fromY: parseFloatParameter('fromY', opts.fromY, 'dragFromToForDuration'),
    toX: parseFloatParameter('toX', opts.toX, 'dragFromToForDuration'),
    toY: parseFloatParameter('toY', opts.toY, 'dragFromToForDuration')
  };
  if (opts.element) {
    // Drag element
    const el = util.unwrapElement(opts.element);
    return await this.proxyCommand(`/wda/element/${el}/dragfromtoforduration`, 'POST', params);
  }
  // Drag coordinates
  return await this.proxyCommand('/wda/dragfromtoforduration', 'POST', params);
};

helpers.mobileSelectPickerWheelValue = async function mobileSelectPickerWheelValue (opts = {}) {
  if (!opts.element) {
    log.errorAndThrow('Element id is expected to be set for selectPickerWheelValue method');
  }
  if (!_.isString(opts.order) || !['next', 'previous'].includes(opts.order.toLowerCase())) {
    log.errorAndThrow(`The mandatory 'order' parameter is expected to be equal either to 'next' or 'previous'. ` +
                      `'${opts.order}' is given instead`);
  }
  const el = util.unwrapElement(opts.element);
  const params = {order: opts.order};
  if (opts.offset) {
    params.offset = parseFloatParameter('offset', opts.offset, 'selectPickerWheelValue');
  }
  return await this.proxyCommand(`/wda/pickerwheel/${el}/select`, 'POST', params);
};

helpers.getCoordinates = async function getCoordinates (gesture) {
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
    let rect = await this.getElementRect(el);
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
