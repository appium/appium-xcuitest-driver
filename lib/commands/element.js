import _ from 'lodash';
import {errors} from 'appium/driver';
import {util} from 'appium/support';

/**
 * Prepares the input value to be passed as an argument to WDA.
 *
 * @param {string|string[]|number} inp The actual text to type.
 * @example
 * ```js
 * // Acceptable values of `inp`:
 * ['some text']
 * ['s', 'o', 'm', 'e', ' ', 't', 'e', 'x', 't']
 * 'some text'
 * 1234
 * ```
 * @throws {Error} If the value is not acceptable for input
 * @returns {string[]} The preprocessed value
 */
function prepareInputValue(inp) {
  if (![_.isArray, _.isString, _.isFinite].some((f) => f(inp))) {
    throw new Error(
      `Only strings, numbers and arrays are supported as input arguments. ` +
        `Received: ${JSON.stringify(inp)}`,
    );
  }

  // make it into a string, so then we assure
  // the array items are single characters
  if (_.isArray(inp)) {
    inp = inp.join('');
  } else if (_.isFinite(inp)) {
    inp = `${inp}`;
  }
  // The `split` method must not be used on the string
  // to properly handle all Unicode code points
  return [...String(inp)].map((k) => {
    if (['\uE006', '\uE007'].includes(k)) {
      // RETURN or ENTER
      return '\n';
    }
    if (['\uE003', '\ue017'].includes(k)) {
      // BACKSPACE or DELETE
      return '\b';
    }
    return k;
  });
}

const commands = {
  /**
   * @this {XCUITestDriver}
   */
  async elementDisplayed(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      return await this.executeAtom('is_displayed', [atomsElement]);
    }

    return await this.proxyCommand(`/element/${el}/displayed`, 'GET');
  },
  /**
   * @this {XCUITestDriver}
   */
  async elementEnabled(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      return await this.executeAtom('is_enabled', [atomsElement]);
    }

    return await this.proxyCommand(`/element/${el}/enabled`, 'GET');
  },
  /**
   * @this {XCUITestDriver}
   */
  async elementSelected(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      return await this.executeAtom('is_selected', [atomsElement]);
    }

    return await this.proxyCommand(`/element/${el}/selected`, 'GET');
  },
  /**
   * @this {XCUITestDriver}
   */
  async getName(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      const script = 'return arguments[0].tagName.toLowerCase()';
      return await this.executeAtom('execute_script', [script, [atomsElement]]);
    }

    return await this.proxyCommand(`/element/${el}/name`, 'GET');
  },
  /**
   * @this {XCUITestDriver}
   */
  async getNativeAttribute(attribute, el) {
    if (attribute === 'contentSize') {
      // don't proxy requests for the content size of a scrollable element
      return await this.getContentSize(el);
    }

    el = util.unwrapElement(el);

    // otherwise let WDA handle attribute requests
    let value = /** @type {string|number|null|undefined|boolean} */ (
      await this.proxyCommand(`/element/${el}/attribute/${attribute}`, 'GET')
    );
    // Transform the result for the case when WDA returns an integer representation for a boolean value
    if ([0, 1].includes(/** @type {number} */ (value))) {
      value = !!value;
    }
    // The returned value must be of type string according to https://www.w3.org/TR/webdriver/#get-element-attribute
    return _.isNull(value) || _.isString(value) ? value : JSON.stringify(value);
  },
  /**
   * @this {XCUITestDriver}
   */
  async getAttribute(attribute, el) {
    el = util.unwrapElement(el);
    if (!this.isWebContext()) {
      return await this.getNativeAttribute(attribute, el);
    }
    const atomsElement = this.getAtomsElement(el);
    return await this.executeAtom('get_attribute_value', [atomsElement, attribute]);
  },
  /**
   * @this {XCUITestDriver}
   */
  async getProperty(property, el) {
    el = util.unwrapElement(el);
    if (!this.isWebContext()) {
      return await this.getNativeAttribute(property, el);
    }
    const atomsElement = this.getAtomsElement(el);
    return await this.executeAtom('get_attribute_value', [atomsElement, property]);
  },
  /**
   * @this {XCUITestDriver}
   */
  async getText(el) {
    el = util.unwrapElement(el);
    if (!this.isWebContext()) {
      return await this.proxyCommand(`/element/${el}/text`, 'GET');
    }
    let atomsElement = this.getAtomsElement(el);
    return await this.executeAtom('get_text', [atomsElement]);
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<import('@appium/types').Rect>}
   */
  async getElementRect(el) {
    if (this.isWebContext()) {
      // Mobile safari doesn't support rect
      const {x, y} = await this.getLocation(el);
      const {width, height} = await this.getSize(el);
      return {x, y, width, height};
    }

    el = util.unwrapElement(el);
    return await this.getNativeRect(el);
  },
  /**
   * Get the position of an element on screen
   *
   * @param {string|Element} elementId - the element ID
   * @returns {Promise<Position>} The position of the element
   * @deprecated Use {@linkcode XCUITestDriver.getElementRect} instead
   * @this {XCUITestDriver}
   */
  async getLocation(elementId) {
    const el = util.unwrapElement(elementId);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      let loc = await this.executeAtom('get_top_left_coordinates', [atomsElement]);
      if (this.opts.absoluteWebLocations) {
        const script =
          'return [' +
          'Math.max(window.pageXOffset,document.documentElement.scrollLeft,document.body.scrollLeft),' +
          'Math.max(window.pageYOffset,document.documentElement.scrollTop,document.body.scrollTop)];';
        const [xOffset, yOffset] = /** @type {[number, number]} */ (await this.execute(script));
        loc.x += xOffset;
        loc.y += yOffset;
      }
      return loc;
    }

    const rect = await this.getElementRect(el);
    return {x: rect.x, y: rect.y};
  },
  /**
   * Alias for {@linkcode XCUITestDriver.getLocation}
   * @param {string|Element} elementId - the element ID
   * @returns {Promise<Position>} The position of the element
   * @deprecated Use {@linkcode XCUITestDriver.getElementRect} instead
   * @this {XCUITestDriver}
   */
  async getLocationInView(elementId) {
    return await this.getLocation(elementId);
  },
  /**
   * Get the size of an element
   * @param {string|Element} el - the element ID
   * @returns {Promise<Size>} The position of the element
   * @this {XCUITestDriver}
   */
  async getSize(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      return await this.executeAtom('get_size', [this.getAtomsElement(el)]);
    }

    const rect = await this.getElementRect(el);
    return {width: rect.width, height: rect.height};
  },
  /**
   * Alias for {@linkcode setValue}
   *
   * @param {string} value - the value to set
   * @param {string} el - the element to set the value of
   * @deprecated
   * @this {XCUITestDriver}
   */
  async setValueImmediate(value, el) {
    // WDA does not provide no way to set the value directly
    this.log.info(
      'There is currently no way to bypass typing using XCUITest. Setting value through keyboard',
    );
    await this.setValue(value, el);
  },
  /**
   * @this {XCUITestDriver}
   */
  async setValue(value, el) {
    el = util.unwrapElement(el);
    if (!this.isWebContext()) {
      await this.proxyCommand(`/element/${el}/value`, 'POST', {
        value: prepareInputValue(value),
      });
      return;
    }

    const atomsElement = this.getAtomsElement(el);
    await this.executeAtom('click', [atomsElement]);

    if (this.opts.sendKeyStrategy !== 'oneByOne') {
      await this.setValueWithWebAtom(atomsElement, value);
      return;
    }
    for (const char of prepareInputValue(value)) {
      await this.setValueWithWebAtom(atomsElement, char);
    }
  },

  /**
   * Set value with Atom for Web. This method calls `type` atom only.
   * Expected to be called as part of {@linkcode setValue}.
   * @this {XCUITestDriver}
   * @param {import('./types').AtomsElement<string>} atomsElement A target element to type the given value.
   * @param {string|string[]} value The actual text to type.
   */
  async setValueWithWebAtom(atomsElement, value) {
    await this.executeAtom('type', [atomsElement, value]);

    if (this.opts.skipTriggerInputEventAfterSendkeys) {
      return;
    }

    function triggerInputEvent(/** @type {EventTarget & {_valueTracker?: any}} */input) {
      let lastValue = '';
      let event = new Event('input', { bubbles: true });
      let tracker = input._valueTracker;
      if (tracker) {
        tracker.setValue(lastValue);
      }
      input.dispatchEvent(event);
    }

    const scriptAsString = `return (${triggerInputEvent}).apply(null, arguments)`;
    await this.executeAtom('execute_script', [scriptAsString, [atomsElement]]);
  },

  /**
   * Send keys to the app
   * @param {string[]} value - Array of keys to send
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.setValue} instead
   */
  async keys(value) {
    await this.proxyCommand('/wda/keys', 'POST', {
      value: prepareInputValue(value),
    });
  },
  /**
   * @this {XCUITestDriver}
   */
  async clear(el) {
    el = util.unwrapElement(el);
    if (this.isWebContext()) {
      const atomsElement = this.getAtomsElement(el);
      await this.executeAtom('clear', [atomsElement]);
      return;
    }
    await this.proxyCommand(`/element/${el}/clear`, 'POST');
  },
  /**
   * @this {XCUITestDriver}
   */
  async getContentSize(el) {
    if (this.isWebContext()) {
      throw new errors.NotYetImplementedError(
        'Support for getContentSize for web context is not yet implemented. Please contact an Appium dev',
      );
    }

    const type = await this.getAttribute('type', el);

    if (type !== 'XCUIElementTypeTable' && type !== 'XCUIElementTypeCollectionView') {
      throw new Error(
        `Can't get content size for type '${type}', only for ` + `tables and collection views`,
      );
    }
    let locator = '*';
    if (type === 'XCUIElementTypeTable') {
      // only find table cells, not just any children
      locator = 'XCUIElementTypeCell';
    }

    let contentHeight = 0;
    const children = await this.findElOrEls(`class chain`, locator, true, el);
    if (children.length === 1) {
      // if we know there's only one element, we can optimize to make just one
      // call to WDA
      const rect = await this.getElementRect(_.head(children));
      contentHeight = rect.height;
    } else if (children.length) {
      // otherwise if we have multiple elements, logic differs based on element
      // type
      switch (type) {
        case 'XCUIElementTypeTable': {
          const firstRect = await this.getElementRect(_.head(children));
          const lastRect = await this.getElementRect(_.last(children));
          contentHeight = lastRect.y + lastRect.height - firstRect.y;
          break;
        }
        case 'XCUIElementTypeCollectionView': {
          let elsInRow = 1; // we know there must be at least one element in the row
          let firstRect = await this.getElementRect(_.head(children));
          let initialRects = [firstRect];
          for (let i = 1; i < children.length; i++) {
            const rect = await this.getElementRect(children[i]);
            initialRects.push(rect);
            if (rect.y !== firstRect.y) {
              elsInRow = i;
              break;
            }
          }
          const spaceBetweenEls =
            initialRects[elsInRow].y -
            initialRects[elsInRow - 1].y -
            initialRects[elsInRow - 1].height;
          const numRows = Math.ceil(children.length / elsInRow);

          // assume all cells are the same height
          contentHeight = numRows * firstRect.height + spaceBetweenEls * (numRows - 1);
          break;
        }
        default:
          throw new Error(
            `Programming error: type '${type}' was not ` +
              `valid but should have already been rejected`,
          );
      }
    }
    const size = await this.getSize(el);
    const origin = await this.getLocationInView(el);
    // attributes have to be strings, so stringify this up
    return JSON.stringify({
      width: size.width,
      height: size.height,
      top: origin.y,
      left: origin.x,
      scrollableOffset: contentHeight,
    });
  },
};

const extensions = {
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<Rect>}
   */
  async getNativeRect(el) {
    return /** @type {Rect} */ (await this.proxyCommand(`/element/${el}/rect`, 'GET'));
  },
};

export default {...extensions, ...commands};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('@appium/types').Element} Element
 * @typedef {import('@appium/types').Position} Position
 * @typedef {import('@appium/types').Size} Size
 * @typedef {import('@appium/types').Rect} Rect
 */
