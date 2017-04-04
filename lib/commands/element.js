import _ from 'lodash';
import { errors } from 'appium-base-driver';
import { iosCommands } from 'appium-ios-driver';
import { util } from 'appium-support';
import { retryInterval } from 'asyncbox';
import log from '../logger';


let commands = {}, extensions = {};
Object.assign(extensions, iosCommands.element);

commands.getAttribute = async function (attribute, el) {
  el = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.proxyCommand(`/element/${el}/attribute/${attribute}`, 'GET');
  }
  let atomsElement = this.getAtomsElement(el);
  if (_.isNull(atomsElement)) {
    throw new errors.UnknownError(`Error converting element ID for using in WD atoms: '${el}`);
  } else {
    return await this.executeAtom('get_attribute_value', [atomsElement, attribute]);
  }
};

commands.getText = async function (el) {
  el = util.unwrapElement(el);
  if (!this.isWebContext()) {
    return await this.proxyCommand(`/element/${el}/text`, 'GET');
  }
  let atomsElement = this.useAtomsElement(el);
  return await this.executeAtom('get_text', [atomsElement]);
};

commands.getRect = async function (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    throw new errors.NotYetImplementedError('Support for getRect for webcontext is not yet implemented. Please contact an Appium dev');
  } else {
    return await this.proxyCommand(`/element/${el}/rect`, 'GET');
  }
};

commands.getLocation = async function (el) {
  el = el.ELEMENT ? el.ELEMENT : el;
  if (this.isWebContext()) {
    let atomsElement = await this.useAtomsElement(el);
    return await this.executeAtom('get_top_left_coordinates', [atomsElement]);
  } else {
    let rect = await this.getRect(el);
    return {x: rect.x, y: rect.y};
  }
};

commands.getLocationInView = async function (el) {
  return await this.getLocation(el);
};

commands.getSize = async function (el) {
  el = el.ELEMENT ? el.ELEMENT : el;
  if (this.isWebContext()) {
    let atomsElement = this.getAtomsElement(el);
    if (atomsElement === null) {
      throw new errors.UnknownError(`Error converting element ID for using in WD atoms: '${el}'`);
    } else {
      return await this.executeAtom('get_size', [atomsElement]);
    }
  } else {
    let rect = await this.getRect(el);
    return {width: rect.width, height: rect.height};
  }
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

extensions.bringUpKeyboard = async function (element) {
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

commands.setValueImmediate = async function (value, el) {
  // WDA does not provide no way to set the value directly
  log.info('There is currently no way to bypass typing using XCUITest. Setting value through keyboard');
  await this.setValue(value, el);
};

commands.setValue = async function (value, el) {
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
    if (typeof value === 'string') {
      // plain string, so make it into an array of characters
      value = value.toString().split('');
    } else if (Array.isArray(value)) {
      // make sure that all the strings inside are a single character long
      value = _.flatMap(value, (v) => v.split(''));
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

commands.keys = async function (value) {
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

commands.clear = async function (el) {
  el = util.unwrapElement(el);
  if (this.isWebContext()) {
    let atomsElement = this.useAtomsElement(el);
    await this.executeAtom('clear', [atomsElement]);
    return;
  }
  await this.proxyCommand(`/element/${el}/clear`, 'POST');
};


Object.assign(extensions, commands);
export { commands };
export default extensions;
