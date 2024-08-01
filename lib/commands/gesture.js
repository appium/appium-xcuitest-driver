import {errors} from 'appium/driver';
import {util} from 'appium/support';
import _ from 'lodash';

const SUPPORTED_GESTURE_DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * Converts the given value to a float number.
 *
 * @throws If `value` is `NaN`
 * @param {any} value
 * @param {string} paramName
 * @returns {number}
 */
function requireFloat(value, paramName) {
  const num = parseFloat(String(value));
  if (Number.isNaN(num)) {
    throw new errors.InvalidArgumentError(
      `"${paramName}" parameter should be a valid number. "${value}" is given instead`,
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
            (x) => x + '=' + (_.isPlainObject(item[x]) ? JSON.stringify(item[x]) : item[x]),
          ).join(', ')})`
        );
      }
      return item.action;
    })
    .join('-');
}

const commands = {
  /**
   * Shake the device
   * @this {XCUITestDriver}
   * @group Simulator Only
   */
  async mobileShake() {
    if (!this.isSimulator()) {
      throw new errors.UnknownError('Shake is not supported on real devices');
    }
    await /** @type {import('../driver').Simulator} */ (this.device).shake();
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
      // clicking can cause an alert to pop up and freeze the event loop, meaning the click atom
      // itself never returns. we have alert handling in `waitForAtom` but with click, we create
      // a special case where if a click results in an unexpected alert error, we just return
      // control to the client. they will encounter the error on their next command, which mirrors
      // the behaviour of selenium.
      try {
        return await this.executeAtom('click', [atomsElement]);
      } catch (err) {
        if (err.error === errors.UnexpectedAlertOpenError.error()) {
          return;
        }
        throw err;
      }
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
   * @param {import('@appium/types').ActionSequence[]} actions
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async performActions(actions) {
    this.log.debug(`Received the following W3C actions: ${JSON.stringify(actions, null, '  ')}`);
    assertNoWebElements(actions);
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
            : {},
        ),
      )
      .map((action) => {
        const modifiedAction = _.clone(action) || {};
        // Selenium API unexpectedly inserts zero pauses, which are not supported by WDA
        modifiedAction.actions = (action.actions || []).filter(
          (innerAction) => !(innerAction.type === 'pause' && innerAction.duration === 0),
        );
        return modifiedAction;
      });
    this.log.debug(`Preprocessed actions: ${JSON.stringify(preprocessedActions, null, '  ')}`);
    await this.proxyCommand('/actions', 'POST', {actions: preprocessedActions});
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
   * Scrolls the current viewport to the given element.
   *
   * This command expects the destination element to be inside a scrollable container and is hittable. The scroll direction is detected automatically.
   *
   * This API uses native XCTest calls, so it is performant. The same native call is implicitly performed by a `click` command if the destination element is outside the current viewport.
   *
   * @since 4.7.0
   * @throws If the scrolling action cannot be performed
   * @privateRemarks See https://github.com/facebook/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBElementCommands.m for details on WDA gestures API
   * @param {Element|string} elementId - The internal element identifier (as hexadecimal hash string) to scroll to. The destination element must be located in a scrollable container and must be hittable. If the element is already present in the current viewport then no action is performed.
   * @returns {Promise<void>}
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
   * Scrolls an element or the entire screen.
   *
   * Use this command to emulate precise scrolling in tables or collection views where it is already known to which element the scrolling should be performed.
   *
   * The arguments define the choosen strategy: one of `name`, `direction`, `predicateString` or `toVisible`.
   *
   * **All strategies are exclusive**; only one strategy can be used at one time.
   *
   * **Known Limitations:**
   *
   * - If it is necessary to perform many scroll gestures on parent container to reach the necessary child element (tens of them), then the method call may fail.  *
   * - The implemntation of this extension relies on several undocumented XCTest features, which might not always be reliable.
   *
   * @param {string} [name] - The internal element identifier (as hexadecimal hash string) to scroll on (e.g. the container). The Application element will be used if this argument is not provided.
   * @param {import('./types').Direction} [direction] - The main difference between this command and a `mobile: swipe` command using the same direction is that `mobile: scroll` will attempt to move the current viewport exactly to the next or previous page (the term "page" means the content, which fits into a single device screen).
   * @param {string} [predicateString] - The `NSPredicate` locator of the child element, to which the scrolling should be performed. Has no effect if `elementId` is not a container.
   * @param {boolean} [toVisible] - If `true`, scrolls to the first visible `elementId` in the parent container. Has no effect if `elementId` is unset.
   * @param {number} [distance] - A ratio of the screen height; `1.0` means a full-screen-worth of scrolling.
   * @param {Element|string} [elementId] - Element ID or Element used in various strategies.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   * @example
   * ```python
   * driver.execute_script('mobile: scroll', {'direction': 'down'})
   * ```
   */
  async mobileScroll(name, direction, predicateString, toVisible, distance, elementId) {
    /**
     * @todo This should be defined in WDA instead.
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
          `'direction' must be one of: ${SUPPORTED_GESTURE_DIRECTIONS}`,
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
          'Specify one of these',
      );
    }
    // we can also optionally pass a distance which appears to be a ratio of
    // screen height, so 1.0 means a full screen's worth of scrolling
    if (!_.isNil(distance)) {
      params.distance = distance;
    }
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/scroll` : '/wda/scroll';
    return await this.proxyCommand(endpoint, 'POST', params);
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
        `'direction' must be one of: ${SUPPORTED_GESTURE_DIRECTIONS}`,
      );
    }
    const params = {direction};
    if (!_.isNil(velocity)) {
      params.velocity = velocity;
    }
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/swipe` : '/wda/swipe';
    await this.proxyCommand(endpoint, 'POST', params);
  },
  /**
   * Performs a pinch gesture on the given element or on the Application element.
   *
   * @param {number} scale - Pinch scale (float value). A value between `0` and `1` performs a "pinch close" (or "zoom out"); a value greater than `1` performs a "pinch open" ("zoom in").
   * @param {number} velocity - The velocity of the pinch in scale factor per second (float value).
   * @param {Element|string} [elementId] The internal element identifier (as hexadecimal hash string) to pinch on. The Application element will be used if this parameter is not provided.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   * @see https://developer.apple.com/documentation/xctest/xcuielement/1618669-pinchwithscale?language=objc
   * @example
   *
   * ```ruby
   * execute_script 'mobile: pinch', scale: 0.5, velocity: 1.1, element: element.ref
   * ```
   */
  async mobilePinch(scale, velocity, elementId) {
    const params = {
      scale: requireFloat(scale, 'scale'),
      velocity: requireFloat(velocity, 'velocity'),
    };
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/pinch` : '/wda/pinch';
    await this.proxyCommand(endpoint, 'POST', params);
  },
  /**
   * Performs double tap gesture on the given element or on the screen.
   *
   * @param {Element|string} [elementId] - The internal element identifier (as hexadecimal hash string) to double tap on. The Application element will be used if this parameter is not provided.
   * @param {number} [x] - The _x_ coordinate (float value) to double tap on.
   * @param {number} [y] - The _y_ coordinate (float value) to double tap on.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   * @example
   * ```javascript
   * // using WebdriverIO
   * await driver.execute('mobile: doubleTap', {element: element.value.ELEMENT});
   * ```
   */
  async mobileDoubleTap(elementId, x, y) {
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/doubleTap` : '/wda/doubleTap';
    await this.proxyCommand(endpoint, 'POST', {x, y});
  },
  /**
   * Performs two finger tap gesture on the given element or on the application element.
   *
   * @param {Element|string} [elementId] - The internal element identifier (as hexadecimal hash string) to double tap on. The Application element will be used if this parameter is not provided.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   * @see https://developer.apple.com/documentation/xctest/xcuielement/1618675-twofingertap?language=objc
   * @example
   * ```csharp
   * Dictionary<string, object> tfTap = new Dictionary<string, object>();
   * tfTap.Add("element", element.Id);
   * ((IJavaScriptExecutor)driver).ExecuteScript("mobile: twoFingerTap", tfTap);
   * ```
   */
  async mobileTwoFingerTap(elementId) {
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/twoFingerTap` : '/wda/twoFingerTap';
    await this.proxyCommand(endpoint, 'POST');
  },
  /**
   * Performs a "long press" gesture on the given element or on the screen.
   *
   * @param {number} duration - The duration (in seconds) of the gesture.
   * @param {number} [y] - The _y_ coordinate (float value) to hold on.
   * @param {number} [x] - The _x_ coordinate (float value) to hold on.
   * @param {Element|string} [elementId] - The internal element identifier (as hexadecimal hash string) to double tap on.  The Application element will be used if this parameter is not provided.
   * @this {XCUITestDriver}
   * @see https://developer.apple.com/documentation/xctest/xcuielement/1618663-pressforduration?language=objc
   * @example
   * ```csharp
   * Dictionary<string, object> tfLongTap = new Dictionary<string, object>();
   * tfLongTap.Add("element", element.Id);
   * tfLongTap.Add("duration", 2.0);
   * ((IJavaScriptExecutor)driver).ExecuteScript("mobile: touchAndHold", tfLongTap);
   * ```
   */
  async mobileTouchAndHold(duration, x, y, elementId) {
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/touchAndHold` : '/wda/touchAndHold';
    await this.proxyCommand(endpoint, 'POST', {
      duration: requireFloat(duration, 'duration'),
      x, y,
    });
  },
  /**
   * Performs tap gesture by coordinates on the given element or on the screen.
   *
   * @param {number} x - The _x_ coordinate (float value) to tap on. If `elementId` is provided, this is computed relative to the element; otherwise it is computed relative to the active Application element.
   * @param {number} y - The _y_ coordinate (float value) to tap on. If `elementId` is provided, this is computed relative to the element; otherwise it is computed relative to the active Application element.
   * @param {string|Element} [elementId] - The internal element identifier (as hexadecimal hash string) to tap on.  The Application element will be used if this parameter is not provided.
   * @this {XCUITestDriver}
   * @returns {Promise<void>}
   */
  async mobileTap(x, y, elementId) {
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/tap` : '/wda/tap';
    await this.proxyCommand(endpoint, 'POST', {x, y});
  },
  /**
   * Performs drag and drop gesture by coordinates on the given element or on the screen.
   *
   * @param {number} duration - The duration (in seconds) of the gesture. Must be between `0.5` and `60.0`, inclusive.
   * @param {number} fromX - The _x_ coordinate (float value) of the starting drag point.
   * @param {number} fromY - The _y_ coordinate (float value) of the starting drag point.
   * @param {number} toX - The _x_ coordinate (float value) of the ending drag point.
   * @param {number} toY - The _y_ coordinate (float value) of the ending drag point.
   * @param {string|Element} [elementId] - The internal element identifier (as hexadecimal hash string) to drag.  If provided, all coordinates will be calculated relative to this element; otherwise they will be calculated relative to the active Application element.
   * @returns {Promise<void>}
   * @see https://developer.apple.com/documentation/xctest/xcuielement/1500989-clickforduration?language=objc
   * @this {XCUITestDriver}
   * @example
   * ```java
   * JavascriptExecutor js = (JavascriptExecutor) driver;
   * Map<String, Object> params = new HashMap<>();
   * params.put("duration", 1.0);
   * params.put("fromX", 100);
   * params.put("fromY", 100);
   * params.put("toX", 200);
   * params.put("toY", 200);
   * params.put("element", ((RemoteWebElement) element).getId());
   * js.executeScript("mobile: dragFromToForDuration", params);
   * ```
   */
  async mobileDragFromToForDuration(duration, fromX, fromY, toX, toY, elementId) {
    const params = {
      duration: requireFloat(duration, 'duration'),
      fromX: requireFloat(fromX, 'fromX'),
      fromY: requireFloat(fromY, 'fromY'),
      toX: requireFloat(toX, 'toX'),
      toY: requireFloat(toY, 'toY'),
    };
    return elementId
      ? // Drag element
        await this.proxyCommand(`/wda/element/${util.unwrapElement(elementId)}/dragfromtoforduration`, 'POST', params)
      : // Drag coordinates
        await this.proxyCommand('/wda/dragfromtoforduration', 'POST', params);
  },
  /**
   * Initiates a press-and-hold gesture, drags to another coordinate or an element with a given velocity, and holds for a given duration.
   *
   * @param {number} pressDuration - The duration (in seconds) of the press-and-hold gesture at the starting point. Must be between `0.5` and `60.0`, inclusive.
   * @param {number} holdDuration - The duration (in seconds) of the hold gesture at the ending point (after dragging). Must be between `0.5` and `60.0`, inclusive.
   * @param {number} velocity - The speed (in pixels-per-second) which to move from the initial position to the end position.
   * @param {string|Element} [fromElementId] - The internal element identifier (as hexadecimal hash string) to drag from.  Absolute screen coordinates are expected if this argument is not provided.
   * @param {string|Element} [toElementId] - The internal element identifier (as hexadecimal hash string) to drag to.  Absolute screen coordinates are expected if this argument is not provided.
   * @param {number} [fromX] - The _x_ coordinate (float value) of the starting drag point.
   * @param {number} [fromY] - The _y_ coordinate (float value) of the starting drag point.
   * @param {number} [toX] - The _x_ coordinate (float value) of the ending drag point.
   * @param {number} [toY] - The _y_ coordinate (float value) of the ending drag point.
   * @returns {Promise<void>}
   * @see https://developer.apple.com/documentation/xctest/xcuielement/3551693-pressforduration?language=objc
   * @see https://developer.apple.com/documentation/xctest/xcuicoordinate/3551692-pressforduration?language=objc
   * @this {XCUITestDriver}
   */
  async mobileDragFromToWithVelocity(
    pressDuration,
    holdDuration,
    velocity,
    fromElementId,
    toElementId,
    fromX,
    fromY,
    toX,
    toY,
  ) {
    const params = {
      pressDuration: requireFloat(pressDuration, 'pressDuration'),
      holdDuration: requireFloat(holdDuration, 'holdDuration'),
      velocity: requireFloat(velocity, 'velocity'),
    };
    fromElementId = fromElementId ? util.unwrapElement(fromElementId) : undefined;
    if (fromElementId) {
      toElementId = toElementId ? util.unwrapElement(toElementId) : undefined;
      if (!toElementId) {
        throw new errors.InvalidArgumentError(
          `"toElementId" parameter is mandatory for "dragFromToWithVelocity" call`,
        );
      }
      params.toElement = toElementId;
      return await this.proxyCommand(
        `/wda/element/${fromElementId}/pressAndDragWithVelocity`,
        'POST',
        params,
      );
    }
    params.fromX = requireFloat(fromX, 'fromX');
    params.fromY = requireFloat(fromY, 'fromY');
    params.toX = requireFloat(toX, 'toX');
    params.toY = requireFloat(toY, 'toY');
    return await this.proxyCommand('/wda/pressAndDragWithVelocity', 'POST', params);
  },
  /**
   * Sends one or more taps with one or more touch points.
   *
   * @since 1.17.1
   * @param {number} [numberOfTaps=1] - Number of taps to perform.
   * @param {number} [numberOfTouches=1] - Number of touch points to use.
   * @param {string|Element} [elementId] - The internal element identifier (as hexadecimal hash string) to perform one or more taps.
   * The Application element will be used if this parameter is not provided.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   * @see https://developer.apple.com/documentation/xctest/xcuielement/1618671-tapwithnumberoftaps?language=objc
   * @example
   * ```ruby
   * e = @driver.find_element :id, 'target element'
   * # Taps the element with a single touch point twice
   * @driver.execute_script 'mobile: tapWithNumberOfTaps', {element: e.ref, numberOfTaps: 2, numberOfTouches: 1}
   * ```
   */
  async mobileTapWithNumberOfTaps(numberOfTouches = 1, numberOfTaps = 1, elementId = undefined) {
    const endpoint = elementId
      ? `/wda/element/${util.unwrapElement(elementId)}/tapWithNumberOfTaps`
      : '/wda/tapWithNumberOfTaps';
    return await this.proxyCommand(endpoint, 'POST', {
      numberOfTaps,
      numberOfTouches,
    });
  },
  /**
   * Performs a "force press" on the given element or coordinates.
   *
   * @throws If the target device does not support the "force press" gesture.
   * @param {number} [x] - The _x_ coordinate of the gesture. If `elementId` is set, this is calculated relative to its position; otherwise it's calculated relative to the active Application.
   * @param {number} [y] - The _y_ coordinate of the gesture. If `elementId` is set, this is calculated relative to its position; otherwise it's calculated relative to the active Application.
   * @param {number} [duration] - The duraiton (in seconds) of the force press. If this is provided, `pressure` must also be provided.
   * @param {number} [pressure] - A float value defining the pressure of the force press. If this is provided, `duration` must also be provided.
   * @param {string|Element} [elementId] - The internal element identifier (as hexadecimal hash string) to perform one or more taps.
   * The Application element will be used if this parameter is not provided.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async mobileForcePress(x, y, duration, pressure, elementId) {
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/forceTouch` : `/wda/forceTouch`;
    return await this.proxyCommand(endpoint, 'POST', {x, y, duration, pressure});
  },
  /**
   * Performs selection of the next or previous picker wheel value.
   *
   * This might be useful if these values are populated dynamically; you don't know which one to select, or the value selection using the `sendKeys` API does not work (for whatever reason).
   *
   * @throws Upon failure to change the current picker value.
   * @param {string|Element} elementId - `PickerWheel`'s internal element ID as hexadecimal hash string. Value selection will be performed on this element. This element must be of type `XCUIElementTypePickerWheel`.
   * @param {'next'|'previous'} order - Either `next` to select the value _next_ to the current from the target picker wheel, or `previous` to select the _previous_ value.
   * @param {number} [offset=0.2] - The value in range `[0.01, 0.5]`. It defines how far from picker wheel's center the click should happen. The actual distance is calculated by multiplying this value to the actual picker wheel height. Too small an offset value may not change the picker wheel value at all, and too high a value may cause the wheel to switch two or more values at once. Usually the optimal value is located in range `[0.15, 0.3]`.
   * @param {string?} [value=undefined] - If provided WDA will try to automatically scroll in the given direction until the actual picker value reaches the expected one or the amount of scrolling attempts is exceeded.
   * @param {number} [maxAttempts=25] - The maximum number of scrolling attempts to reach `value` before an error will be thrown. Only makes sense in combination with `value`.
   * @this {XCUITestDriver}
   * @example
   * ```java
   * JavascriptExecutor js = (JavascriptExecutor) driver;
   * Map<String, Object> params = new HashMap<>();
   * params.put("order", "next");
   * params.put("offset", 0.15);
   * params.put("element", ((RemoteWebElement) element).getId());
   * js.executeScript("mobile: selectPickerWheelValue", params);
   * ```
   */
  async mobileSelectPickerWheelValue(elementId, order, offset, value, maxAttempts) {
    if (!elementId) {
      throw new errors.InvalidArgumentError(
        'elementId is expected to be set for selectPickerWheelValue method',
      );
    }
    if (!_.isString(order) || !['next', 'previous'].includes(order.toLowerCase())) {
      throw new errors.InvalidArgumentError(
        `The mandatory 'order' parameter is expected to be equal either to 'next' or 'previous'. ` +
          `'${order}' is given instead`,
      );
    }
    const params = {order};
    if (offset) {
      params.offset = requireFloat(offset, 'offset');
    }
    if (!_.isNil(value)) {
      params.value = value;
    }
    if (!_.isNil(maxAttempts)) {
      params.maxAttempts = maxAttempts;
    }
    return await this.proxyCommand(`/wda/pickerwheel/${util.unwrapElement(elementId)}/select`, 'POST', params);
  },
  /**
   * Performs a rotate gesture on the given element.
   *
   * @see https://developer.apple.com/documentation/xctest/xcuielement/1618665-rotate?language=objc
   * @param {number} rotation - The rotation gesture (in radians)
   * @param {number} velocity - The velocity (in radians-per-second) of the gesture.
   * @param {string|Element} [elementId] - The internal element identifier (as hexadecimal hash string) to perform the gesture on.
   * The Application element will be used if this parameter is not provided.
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   * @example
   * ```java
   * JavascriptExecutor js = (JavascriptExecutor) driver;
   * js.executeScript("mobile: rotateElement", ImmutableMap.of(
   *     // rotate clockwise, 90 degrees
   *     "rotation", -Math.PI / 2,
   *     // in approximately two seconds
   *     "velocity", Math.PI / 4,
   *     "element", ((RemoteWebElement) element).getId()
   * ));
   * ```
   */
  async mobileRotateElement(rotation, velocity, elementId) {
    const params = {
      rotation: requireFloat(rotation, 'rotation'),
      velocity: requireFloat(velocity, 'velocity'),
    };
    const endpoint = elementId ? `/wda/element/${util.unwrapElement(elementId)}/rotate` : '/wda/rotate';
    return await this.proxyCommand(endpoint, 'POST', params);
  },
};

export default {...helpers, ...commands};

/**
 * @param {import('@appium/types').ActionSequence[]} actionSeq
 */
function assertNoWebElements(actionSeq) {
  const isOriginWebElement = (gesture) =>
    _.isPlainObject(gesture) && 'origin' in gesture && JSON.stringify(gesture.origin).includes(':wdc:');
  const hasWebElements = actionSeq
    .some((action) => (action?.actions || []).some(isOriginWebElement));
  if (hasWebElements) {
    throw new errors.InvalidArgumentError(
      `The XCUITest driver only supports W3C actions execution in the native context. ` +
      `Although, your W3C action contains one or more web elements, ` +
      `which cannot be automatically mapped to the native context. ` +
      `Consider mapping their absolute web coordinates to native context coordinates ` +
      `and passing them to your gesture instead.`
    );
  }
}

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('@appium/types').Element} Element
 */
