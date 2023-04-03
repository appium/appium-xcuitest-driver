import {errors} from 'appium/driver';
import {util} from 'appium/support';
import _ from 'lodash';

const SUPPORTED_GESTURE_DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * @param {any} [opts]
 * @returns {string|undefined}
 */
function toElementId(opts) {
  if (_.isUndefined(opts)) {
    return;
  }
  if (_.isString(opts) || _.isNumber(opts)) {
    return String(opts);
  }
  if ('elementId' in opts || 'element' in opts) {
    return util.unwrapElement(opts);
  }
}

/**
 *
 * @param {XCUITestDriver} driver
 * @param {Element|string} [elementId]
 * @returns {Promise<string>}
 */
async function toElementOrApplicationId(driver, elementId) {
  if (!_.isUndefined(elementId)) {
    return util.unwrapElement(elementId);
  }
  return util.unwrapElement(await driver.findNativeElementOrElements(`class name`, `XCUIElementTypeApplication`, false));
}

/**
 * Converts the given value to a float number.
 *
 * @throws If `value` is `NaN`
 * @param {any} value
 * @param {string} paramName
 * @returns {number}
 */
function asFloat(value, paramName) {
  const num = parseFloat(String(value));
  if (Number.isNaN(num)) {
    throw new errors.InvalidArgumentError(
      `"${paramName}" parameter should be a valid number. "${value}" is given instead`
    );
  }
  return num;
}

/**
 * Converts the given value to an integer number.
 *
 * @throws If `value` is `NaN`
 * @param {any} value
 * @param {string} paramName
 * @returns {number}
 */
function asInt(value, paramName) {
  const num = parseInt(String(value), 10);
  if (Number.isNaN(num)) {
    throw new errors.InvalidArgumentError(
      `"${paramName}" parameter should be a valid integer. "${value}" is given instead`
    );
  }
  return num;
}

/**
 *
 * @param {any[]} gestures
 * @param {string[]|null} keysToInclude
 * @returns {string}
 */
export function gesturesChainToString(gestures, keysToInclude = ['options']) {
  return gestures
    .map((item) => {
      let otherKeys = _.difference(_.keys(item), ['action']);
      otherKeys = _.isArray(keysToInclude) ? _.intersection(otherKeys, keysToInclude) : otherKeys;
      if (otherKeys.length) {
        return (
          `${item.action}` +
          `(${_.map(
            otherKeys,
            (x) => x + '=' + (_.isPlainObject(item[x]) ? JSON.stringify(item[x]) : item[x])
          ).join(', ')})`
        );
      }
      return item.action;
    })
    .join('-');
}

const commands = {
  /**
   * Move the mouse pointer to a particular screen location
   *
   * @param {string|Element} el - the element ID if the move is relative to an element
   * @param {number} xoffset - the x offset
   * @param {number} yoffset - the y offset
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.performActions} instead
   */
  async moveTo(el, xoffset = 0, yoffset = 0) {
    el = util.unwrapElement(el);

    if (this.isWebContext()) {
      let {x, y} = await this.getLocation(el);
      let coords = {
        x: x + xoffset,
        y: y + yoffset,
      };
      this.curWebCoords = coords;
      let atomsElement = this.getAtomsElement(el);
      let relCoords = {x: xoffset, y: yoffset};
      await this.executeAtom('move_mouse', [atomsElement, relCoords]);
    } else {
      if (_.isNil(el)) {
        if (!this.curCoords) {
          throw new errors.UnknownError(
            'Current cursor position unknown, please use moveTo with an element the first time.'
          );
        }
        this.curCoords = {
          x: this.curCoords.x + xoffset,
          y: this.curCoords.y + yoffset,
        };
      } else {
        let elPos = await this.getLocation(el);
        this.curCoords = {
          x: elPos.x + xoffset,
          y: elPos.y + yoffset,
        };
      }
    }
  },
  /**
   * Shake the device
   * @this {XCUITestDriver}
   * @group Simulator Only
   */
  async mobileShake() {
    if (!this.isSimulator()) {
      throw new errors.UnknownError('Shake is not supported on real devices');
    }
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    await this.opts.device.shake();
  },
  /**
   * @this {XCUITestDriver}
   */
  async click(el) {
    if (!this.isWebContext()) {
      // there are multiple commands that map here, so manually proxy
      return await this.nativeClick(el);
    }
    el = util.unwrapElement(el);
    const {nativeWebTap, nativeWebTapStrict} = this.settings.getSettings();
    if (nativeWebTap || nativeWebTapStrict) {
      // atoms-based clicks don't always work in safari 7
      this.log.debug('Using native web tap');
      await this.nativeWebTap(el);
    } else {
      const atomsElement = this.getAtomsElement(el);
      return await this.executeAtom('click', [atomsElement]);
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  // eslint-disable-next-line require-await
  async releaseActions() {
    this.log.warn('On this platform, releaseActions is a no-op');
  },
  /**
   * @this {XCUITestDriver}
   */
  async performActions(actions) {
    this.log.debug(`Received the following W3C actions: ${JSON.stringify(actions, null, '  ')}`);
    // This is mandatory, since WDA only supports TOUCH pointer type
    // and Selenium API uses MOUSE as the default one
    const preprocessedActions = actions
      .map((action) =>
        Object.assign(
          {},
          action,
          action.type === 'pointer'
            ? {
                parameters: {
                  pointerType: 'touch',
                },
              }
            : {}
        )
      )
      .map((action) => {
        const modifiedAction = _.clone(action) || {};
        // Selenium API unexpectedly inserts zero pauses, which are not supported by WDA
        modifiedAction.actions = (action.actions || []).filter(
          (innerAction) => !(innerAction.type === 'pause' && innerAction.duration === 0)
        );
        return modifiedAction;
      });
    this.log.debug(`Preprocessed actions: ${JSON.stringify(preprocessedActions, null, '  ')}`);
    return await this.proxyCommand('/actions', 'POST', {actions: preprocessedActions});
  },
  /**
   * Perform a set of touch actions
   *
   * @param {any[]} gestures - the old MJSONWP style touch action objects
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.performActions} instead
   */
  async performTouch(gestures) {
    this.log.debug(`Received the following touch action: ${gesturesChainToString(gestures)}`);
    try {
      return await this.proxyCommand('/wda/touch/perform', 'POST', {actions: gestures});
    } catch (e) {
      if (!this.isWebContext()) {
        throw e;
      }
      this.log.errorAndThrow(
        'The Touch API is aimed for usage in NATIVE context. ' +
          'Consider using "execute" API with custom events trigger script ' +
          `to emulate touch events being in WEBVIEW context. Original error: ${e.message}`
      );
    }
  },
  /**
   * Perform a set of touch actions
   *
   * @param {any[]} actions - the old MJSONWP style touch action objects
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.performActions} instead
   * @group Native Only
   */
  async performMultiAction(actions) {
    this.log.debug(`Received the following multi touch action:`);
    for (let i in actions) {
      this.log.debug(`    ${parseInt(i, 10) + 1}: ${_.map(actions[i], 'action').join('-')}`);
    }
    try {
      return await this.proxyCommand('/wda/touch/multi/perform', 'POST', {actions});
    } catch (e) {
      if (!this.isWebContext()) {
        throw e;
      }
      this.log.errorAndThrow(
        'The MultiTouch API is aimed for usage in NATIVE context. ' +
          'Consider using "execute" API with custom events trigger script ' +
          `to emulate multitouch events being in WEBVIEW context. Original error: ${e.message}`
      );
    }
  },
  /**
   * @param {import('@appium/types').Element|string} el
   * @this {XCUITestDriver}
   * @group Native Only
   */
  async nativeClick(el) {
    el = util.unwrapElement(el);
    let endpoint = `/element/${el}/click`;
    return await this.proxyCommand(endpoint, 'POST', {});
  },

  /**
   * See https://github.com/facebook/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBElementCommands.m
   * to get the info about available WDA gestures API
   *
   * See https://developer.apple.com/reference/xctest/xcuielement and
   * https://developer.apple.com/reference/xctest/xcuicoordinate to get the detailed description of
   * all XCTest gestures
   * @param {Element|string} elementId
   * @this {XCUITestDriver}
   */
  async mobileScrollToElement(elementId) {
    if (!elementId) {
      throw new errors.InvalidArgumentError('Element id must be provided');
    }
    return await this.proxyCommand(`/wda/element/${elementId}/scrollTo`, 'POST', {});
  },
};

const helpers = {
  /**
   * @param {string} [name]
   * @param {import('./types').Direction} [direction]
   * @param {string} [predicateString]
   * @param {boolean} [toVisible]
   * @param {number} [distance]
   * @param {Element|string} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileScroll(name, direction, predicateString, toVisible, distance, elementId) {
    // WDA supports four scrolling strategies: predication based on name, direction,
    // predicateString, and toVisible, in that order
    /**
     * @typedef WdaScrollParams
     * @property {string} [name]
     * @property {import('./types').Direction} [direction]
     * @property {string} [predicateString]
     * @property {boolean} [toVisible]
     * @property {number} [distance]
     */

    /** @type {WdaScrollParams} */
    const params = {};
    if (name) {
      params.name = name;
    } else if (direction) {
      if (!SUPPORTED_GESTURE_DIRECTIONS.includes(_.toLower(direction))) {
        throw new errors.InvalidArgumentError(
          `'direction' must be one of: ${SUPPORTED_GESTURE_DIRECTIONS}`
        );
      }
      params.direction = direction;
    } else if (predicateString) {
      params.predicateString = predicateString;
    } else if (toVisible) {
      params.toVisible = toVisible;
    } else {
      throw new errors.InvalidArgumentError(
        'Mobile scroll supports the following strategies: name, direction, predicateString, and toVisible. ' +
          'Specify one of these'
      );
    }
    // we can also optionally pass a distance which appears to be a ratio of
    // screen height, so 1.0 means a full screen's worth of scrolling
    if (!_.isNil(distance)) {
      params.distance = distance;
    }
    elementId = await toElementOrApplicationId(this, elementId);
    return await this.proxyCommand(`/wda/element/${elementId}/scroll`, 'POST', params);
  },
  /**
   * @param {import('./types').Direction} direction
   * @param {number} [velocity]
   * @param {Element|string} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileSwipe(direction, velocity, elementId) {
    if (!SUPPORTED_GESTURE_DIRECTIONS.includes(_.toLower(direction))) {
      throw new errors.InvalidArgumentError(
        `'direction' must be one of: ${SUPPORTED_GESTURE_DIRECTIONS}`
      );
    }
    const params = {direction};
    if (!_.isNil(velocity)) {
      params.velocity = velocity;
    }
    elementId = await toElementOrApplicationId(this, elementId);
    return await this.proxyCommand(`/wda/element/${elementId}/swipe`, 'POST', params);
  },
  /**
   * @param {number} scale
   * @param {number} velocity
   * @param {Element|string} [elementId]
   * @this {XCUITestDriver}
   */
  async mobilePinch(scale, velocity, elementId) {
    const params = {
      scale: asFloat(scale, 'scale'),
      velocity: asFloat(velocity, 'velocity'),
    };
    elementId = await toElementOrApplicationId(this, elementId);
    return await this.proxyCommand(`/wda/element/${elementId}/pinch`, 'POST', params);
  },
  /**
   * @param {Element|string} [elementId]
   * @param {number} [x]
   * @param {number} [y]
   * @this {XCUITestDriver}
   */
  async mobileDoubleTap(elementId, x, y) {
    if (elementId) {
      // Double tap element
      return await this.proxyCommand(`/wda/element/${elementId}/doubleTap`, 'POST');
    }
    // Double tap coordinates
    const params = {
      x: asFloat(x, 'x'),
      y: asFloat(y, 'y'),
    };
    return await this.proxyCommand('/wda/doubleTap', 'POST', params);
  },
  /**
   * @param {Element|string} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileTwoFingerTap(elementId) {
    elementId = await toElementOrApplicationId(this, elementId);
    return await this.proxyCommand(`/wda/element/${elementId}/twoFingerTap`, 'POST');
  },
  /**
   * @param {number} duration
   * @param {number} [x]
   * @param {number} [y]
   * @param {string|Element} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileTouchAndHold(duration, x, y, elementId) {
    const params = {
      duration: asFloat(duration, 'duration'),
    };
    if (elementId) {
      // Long tap element
      return await this.proxyCommand(`/wda/element/${elementId}/touchAndHold`, 'POST', params);
    }
    // Long tap coordinates
    params.x = asFloat(x, 'x');
    params.y = asFloat(y, 'y');
    return await this.proxyCommand('/wda/touchAndHold', 'POST', params);
  },
  /**
   * @param {number} x
   * @param {number} y
   * @param {string|Element} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileTap(x, y, elementId = '0') {
    const params = {
      x: asFloat(x, 'x'),
      y: asFloat(y, 'y'),
    };
    return await this.proxyCommand(`/wda/tap/${elementId}`, 'POST', params);
  },
  /**
   * @param {number} duration
   * @param {number} fromX
   * @param {number} fromY
   * @param {number} toX
   * @param {number} toY
   * @param {string|Element} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileDragFromToForDuration(duration, fromX, fromY, toX, toY, elementId) {
    const params = {
      duration: asFloat(duration, 'duration'),
      fromX: asFloat(fromX, 'fromX'),
      fromY: asFloat(fromY, 'fromY'),
      toX: asFloat(toX, 'toX'),
      toY: asFloat(toY, 'toY'),
    };
    elementId = toElementId(elementId);
    return elementId
      ? // Drag element
        await this.proxyCommand(`/wda/element/${elementId}/dragfromtoforduration`, 'POST', params)
      : // Drag coordinates
        await this.proxyCommand('/wda/dragfromtoforduration', 'POST', params);
  },
  /**
   * @param {number} pressDuration
   * @param {number} holdDuration
   * @param {number} velocity
   * @param {string|Element} [fromElementId]
   * @param {string|Element} [toElementId]
   * @param {number} [fromX]
   * @param {number} [fromY]
   * @param {number} [toX]
   * @param {number} [toY]
   * @this {XCUITestDriver}
   */
  async mobileDragFromToWithVelocity(pressDuration, holdDuration, velocity, fromElementId, toElementId, fromX, fromY, toX, toY) {
    const params = {
      pressDuration: asFloat(pressDuration, 'pressDuration'),
      holdDuration: asFloat(holdDuration, 'holdDuration'),
      velocity: asFloat(velocity, 'velocity'),
    };
    fromElementId = fromElementId ? util.unwrapElement(fromElementId) : undefined;
    if (fromElementId) {
      toElementId = toElementId ? util.unwrapElement(toElementId) : undefined;
      if (!toElementId) {
        throw new errors.InvalidArgumentError(
          `"toElementId" parameter is mandatory for "dragFromToWithVelocity" call`
        );
      }
      params.toElement = toElementId;
      return await this.proxyCommand(
        `/wda/element/${fromElementId}/pressAndDragWithVelocity`,
        'POST',
        params
      );
    }
    params.fromX = asFloat(fromX, 'fromX');
    params.fromY = asFloat(fromY, 'fromY');
    params.toX = asFloat(toX, 'toX');
    params.toY = asFloat(toY, 'toY');
    return await this.proxyCommand('/wda/pressAndDragWithVelocity', 'POST', params);
  },
  /**
   * @param {string|Element} elementId
   * @param {number} numberOfTaps
   * @param {number} numberOfTouches
   * @this {XCUITestDriver}
   */
  async mobileTapWithNumberOfTaps(elementId, numberOfTaps, numberOfTouches) {
    if (!elementId) {
      throw new errors.InvalidArgumentError(
        'Element id is expected to be set for tapWithNumberOfTaps method'
      );
    }
    const params = {
      numberOfTaps: asInt(numberOfTaps, 'numberOfTaps'),
      numberOfTouches: asInt(numberOfTouches, 'numberOfTouches'),
    };
    return await this.proxyCommand(`/wda/element/${elementId}/tapWithNumberOfTaps`, 'POST', params);
  },
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} duration
   * @param {number} pressure
   * @param {string|Element} [elementId]
   * @this {XCUITestDriver}
   */
  async mobileForcePress(x, y, duration, pressure, elementId) {
    elementId = toElementId(elementId);
    const endpoint = elementId ? `/wda/element/${elementId}/forceTouch` : `/wda/forceTouch`;
    return await this.proxyCommand(endpoint, 'POST', {x, y, duration, pressure});
  },
  /**
   * Performs selection of the next or previous picker wheel value.
   * This might be useful if these values are populated dynamically (so you
   * don't know which one to select) or if value selection using the `sendKeys` API does
   * not work due to an XCTest bug. The method throws an exception if it
   * fails to change the current picker value.
   * @param {string|Element} elementId - The element id for the picker wheel
   * @param {'next'|'previous'} order - The order in which to select the value. Either `next` or `previous`
   * @param {number} [offset] - The offset from the start of the picker wheel. This is useful if there are multiple picker wheels on the screen
   * @this {XCUITestDriver}
   */
  async mobileSelectPickerWheelValue(elementId, order, offset) {
    elementId = /** @type {string} */(toElementId(elementId));
    if (!elementId) {
      throw new errors.InvalidArgumentError(
        'elementId is expected to be set for selectPickerWheelValue method'
      );
    }
    if (!_.isString(order) || !['next', 'previous'].includes(order.toLowerCase())) {
      throw new errors.InvalidArgumentError(
        `The mandatory 'order' parameter is expected to be equal either to 'next' or 'previous'. ` +
          `'${order}' is given instead`
      );
    }
    const params = {order};
    if (offset) {
      params.offset = asFloat(offset, 'offset');
    }
    return await this.proxyCommand(`/wda/pickerwheel/${elementId}/select`, 'POST', params);
  },
  /**
   * @param {string|Element} elementId
   * @param {number} rotation
   * @param {number} velocity
   * @this {XCUITestDriver}
   */
  async mobileRotateElement(elementId, rotation, velocity) {
    elementId = /** @type {string} */(toElementId(elementId));
    if (!elementId) {
      throw new errors.InvalidArgumentError(
        'Element id is expected to be set for rotateElement method'
      );
    }
    const params = {
      rotation: asFloat(rotation, 'rotation'),
      velocity: asFloat(velocity, 'velocity'),
    };
    return await this.proxyCommand(`/wda/element/${elementId}/rotate`, 'POST', params);
  },
  /**
   * @this {XCUITestDriver}
   */
  async getCoordinates(gesture) {
    // defaults
    let coordinates = {x: 0, y: 0, areOffsets: false};

    let optionX = null;
    if (gesture.options.x) {
      optionX = asFloat(gesture.options.x, 'x');
    }
    let optionY = null;
    if (gesture.options.y) {
      optionY = asFloat(gesture.options.y, 'y');
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
        offsetX = optionX || 0;
        offsetY = optionY || 0;
      } else {
        offsetX = size.w / 2;
        offsetY = size.h / 2;
      }

      // apply the offsets
      coordinates.x = pos.x + offsetX;
      coordinates.y = pos.y + offsetY;
    } else {
      // moveTo coordinates are passed in as offsets
      coordinates.areOffsets = gesture.action === 'moveTo';
      coordinates.x = optionX || 0;
      coordinates.y = optionY || 0;
    }
    return coordinates;
  },
  /**
   * @this {XCUITestDriver}
   */
  applyMoveToOffset(firstCoordinates, secondCoordinates) {
    if (secondCoordinates.areOffsets) {
      return {
        x: firstCoordinates.x + secondCoordinates.x,
        y: firstCoordinates.y + secondCoordinates.y,
      };
    } else {
      return secondCoordinates;
    }
  },
};

export default {...helpers, ...commands};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('@appium/types').Element} Element
 */
