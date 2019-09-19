import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { iosCommands } from 'appium-ios-driver';
import { util } from 'appium-support';
import { retryInterval, retry } from 'asyncbox';
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

function hasSpecialKeys (keys) {
  for (let char of keys) {
    if (isSpecialKey(char)) {
      return true;
    }
  }
  return false;
}

function isSpecialKey (k) {
  if (k === '\uE003' || k === '\ue017') { // BACKSPACE or DELETE
    return true;
  } else if (k === '\uE006' || k === '\uE007') { // RETURN or ENTER
    return true;
  }
  return false;
}

function translateKey (k) {
  if (k === '\uE006' || k === '\uE007') { // RETURN or ENTER
    return '\n';
  } else if (k === '\uE003' || k === '\ue017') { // BACKSPACE or DELETE
    return '\b';
  }
  return k;
}

extensions.bringUpKeyboard = async function bringUpKeyboard (element) {
  // sometimes input is attempted before we have a keyboard. Try to bring one up
  // but we want to handle the retries on find
  let implicitWaitMs = this.implicitWaitMs;
  await this.setImplicitWait(0);
  try {
    await retryInterval(10, 10, async () => {
      try {
        await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
        log.debug('Keyboard found. Continuing with text input.');
      } catch (err) {
        // no keyboard found
        log.debug('No keyboard found. Clicking element to open it.');
        await this.nativeClick(element);

        await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
      }
    });
  } finally {
    // no matter what we do, make sure we have the implicit wait set up correctly
    await this.setImplicitWait(implicitWaitMs);
  }
};

commands.setValueImmediate = async function setValueImmediate (value, el) {
  // WDA does not provide no way to set the value directly
  log.info('There is currently no way to bypass typing using XCUITest. Setting value through keyboard');
  await this.setValue(value, el);
};

commands.setValue = async function setValue (value, el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    let atomsElement = this.useAtomsElement(el);
    await this.executeAtom('click', [atomsElement]);
    await this.executeAtom('type', [atomsElement, value]);
  } else {
    const setFormattedValue = async (input, isKeyboardPresenceCheckEnabled) => {
      if (typeof input !== 'string' && !(input instanceof Array)) {
        input = input.toString().split('');
      }
      try {
        await this.proxyCommand(`/element/${el}/value`, 'POST', {value: input});
      } catch (err) {
        // make sure there is a keyboard if this is a text field
        if (isKeyboardPresenceCheckEnabled && await this.getAttribute('type', el) === 'XCUIElementTypeTextField') {
          log.info(`Cannot type in the text field because of ${err}.\nTrying to apply a workaround...`);
          await this.bringUpKeyboard(el);
          await this.proxyCommand(`/element/${el}/value`, 'POST', {value: input});
        } else {
          throw err;
        }
      }
    };

    // possible values of `value`:
    //   ['some text']
    //   ['s', 'o', 'm', 'e', ' ', 't', 'e', 'x', 't']
    //   'some text'
    if (_.isNull(value) || _.isUndefined(value) || _.isPlainObject(value)) {
      throw new Error(`Only strings and arrays of strings are supported as input arguments. Received: '${JSON.stringify(value)}'`);
    }
    if (_.isArray(value)) {
      // make sure that all the strings inside are a single character long
      value = _.flatMap(value, (v) => (_.isString(v) ? v : JSON.stringify(v)).split(''));
    } else {
      // make it into an array of characters
      value = (value || '').toString().split('');
    }

    if (!hasSpecialKeys(value)) {
      // nothing special, so just send it in
      await setFormattedValue(value, true);
      return;
    }

    // if there are special characters, go through the value until we get to one,
    // and then print it individually
    // currently only supporting return, enter, backspace, and delete
    let buffer = [];
    let isFirstChar = true;
    for (let k of value) {
      let char = translateKey(k);

      if (char === k) {
        buffer.push(char);
        continue;
      }

      // write and clear the buffer
      await setFormattedValue(buffer, isFirstChar);
      isFirstChar = false;
      buffer = [];

      // write the character
      await setFormattedValue([char], isFirstChar);
    }
    // finally, send anything that might be left
    if (buffer.length) {
      await setFormattedValue(buffer, false);
    }
  }
};

commands.keys = async function keys (value) {
  if (_.isArray(value)) {
    // concatenate any individual strings
    value = value.join('');
  }
  if (_.isString(value)) {
    // split into component characters
    value = value.split('');
  }

  let buffer = [];
  for (let k of value) {
    let char = translateKey(k);

    buffer.push(char);
  }
  await this.proxyCommand('/wda/keys', 'POST', {value: buffer});
};

commands.clear = async function clear (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    let atomsElement = this.useAtomsElement(el);
    await this.executeAtom('clear', [atomsElement]);
    return;
  }
  await retry(5, this.proxyCommand.bind(this), `/element/${el}/clear`, 'POST');
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
