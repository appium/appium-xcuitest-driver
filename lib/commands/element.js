import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { iosCommands } from 'appium-ios-driver';
import { util } from 'appium-support';
import log from '../logger';


let commands = {}, extensions = {};

// pull in all the element commands and helpers from ios-driver,
// then override anything we want below
Object.assign(extensions, iosCommands.element);

commands.getNativeAttribute = async function getNativeAttribute (attribute, el) {
  if (attribute === 'contentSize') {
    // don't proxy requests for the content size of a scrollable element
    return await this.getContentSize(el);
  }

  el = util.unwrapElement(el);

  // otherwise let WDA handle attribute requests
  let value = await this.proxyCommand(`/element/${el}/attribute/${attribute}`, 'GET');
  // Transform the result for the case when WDA returns an integer representation for a boolean value
  if ([0, 1].includes(value)) {
    value = !!value;
  }
  // The returned value must be of type string according to https://www.w3.org/TR/webdriver/#get-element-attribute
  return (_.isNull(value) || _.isString(value)) ? value : JSON.stringify(value);
};

commands.getAttribute = async function getAttribute (attribute, el) {
  el = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.getNativeAttribute(attribute, el);
  }
  const atomsElement = this.getAtomsElement(el);
  if (_.isNull(atomsElement)) {
    throw new errors.UnknownError(`Error converting element ID for using in WD atoms: '${el}`);
  }
  return await this.executeAtom('get_attribute_value', [atomsElement, attribute]);
};

commands.getText = async function getText (el) {
  el = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.proxyCommand(`/element/${el}/text`, 'GET');
  }
  let atomsElement = this.useAtomsElement(el);
  return await this.executeAtom('get_text', [atomsElement]);
};

commands.getElementRect = async function getElementRect (el) {
  if (this.isWebContext()) {
    // Mobile safari doesn't support rect
    const {x, y} = await this.getLocation(el);
    const {width, height} = await this.getSize(el);
    return {x, y, width, height};
  }

  el = util.unwrapElement(el);
  return await this.getNativeRect(el);
};

extensions.getNativeRect = async function getNativeRect (el) {
  return await this.proxyCommand(`/element/${el}/rect`, 'GET');
};

commands.getLocation = async function getLocation (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = await this.useAtomsElement(el);
    let loc = await this.executeAtom('get_top_left_coordinates', [atomsElement]);
    if (this.opts.absoluteWebLocations) {
      const script = 'return [document.body.scrollLeft, document.body.scrollTop];';
      const [xOffset, yOffset] = await this.execute(script);
      loc.x += xOffset;
      loc.y += yOffset;
    }
    return loc;
  }

  const rect = await this.getElementRect(el);
  return {x: rect.x, y: rect.y};
};

commands.getLocationInView = async function getLocationInView (el) {
  return await this.getLocation(el);
};

commands.getSize = async function getSize (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    let atomsElement = this.getAtomsElement(el);
    if (atomsElement === null) {
      throw new errors.UnknownError(`Error converting element ID for using in WD atoms: '${el}'`);
    }
    return await this.executeAtom('get_size', [atomsElement]);
  }

  const rect = await this.getElementRect(el);
  return {width: rect.width, height: rect.height};
};

/**
 * Prepares the input value to be passed as an argument to WDA.
 *
 * @param {string|Array<string>|number} inp The actual text to type.
 * Acceptable values of `inp`:
 *   ['some text']
 *   ['s', 'o', 'm', 'e', ' ', 't', 'e', 'x', 't']
 *   'some text'
 *   1234
 * @throws {Error} If the value is not acceptable for input
 * @returns {Array<string>} The preprocessed value
 */
function prepareInputValue (inp) {
  if (![_.isArray, _.isString, _.isFinite].some((f) => f(inp))) {
    throw new Error(`Only strings, numbers and arrays are supported as input arguments. ` +
      `Received: ${JSON.stringify(inp)}`);
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
  return [...inp].map((k) => {
    if (['\uE006', '\uE007'].includes(k)) { // RETURN or ENTER
      return '\n';
    }
    if (['\uE003', '\ue017'].includes(k)) { // BACKSPACE or DELETE
      return '\b';
    }
    return k;
  });
}

commands.setValueImmediate = async function setValueImmediate (value, el) {
  // WDA does not provide no way to set the value directly
  log.info('There is currently no way to bypass typing using XCUITest. Setting value through keyboard');
  await this.setValue(value, el);
};

commands.setValue = async function setValue (value, el) {
  el = util.unwrapElement(el);
  if (!this.isWebContext()) {
    await this.proxyCommand(`/element/${el}/value`, 'POST', {
      value: prepareInputValue(value),
    });
    return;
  }

  const atomsElement = this.useAtomsElement(el);
  await this.executeAtom('click', [atomsElement]);
  await this.executeAtom('type', [atomsElement, value]);
};

commands.keys = async function keys (value) {
  await this.proxyCommand('/wda/keys', 'POST', {
    value: prepareInputValue(value),
  });
};

commands.clear = async function clear (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    const atomsElement = this.useAtomsElement(el);
    await this.executeAtom('clear', [atomsElement]);
    return;
  }
  await this.proxyCommand(`/element/${el}/clear`, 'POST');
};

commands.getContentSize = async function getContentSize (el) {
  if (this.isWebContext()) {
    throw new errors.NotYetImplementedError('Support for getContentSize for web context is not yet implemented. Please contact an Appium dev');
  }

  const type = await this.getAttribute('type', el);

  if (type !== 'XCUIElementTypeTable' &&
      type !== 'XCUIElementTypeCollectionView') {
    throw new Error(`Can't get content size for type '${type}', only for ` +
                    `tables and collection views`);
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
        const spaceBetweenEls = initialRects[elsInRow].y - initialRects[elsInRow - 1].y - initialRects[elsInRow - 1].height;
        const numRows = Math.ceil(children.length / elsInRow);

        // assume all cells are the same height
        contentHeight = (numRows * firstRect.height) + (spaceBetweenEls * (numRows - 1));
        break;
      }
      default: throw new Error(`Programming error: type '${type}' was not ` +
                               `valid but should have already been rejected`);
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
    scrollableOffset: contentHeight
  });
};

commands.isKeyboardShown = async function isKeyboardShown () {
  try {
    await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
    return true;
  } catch (ign) {
    return false;
  }
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
