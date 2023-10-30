import _ from 'lodash';

export default {
  /**
   * @this {XCUITestDriver}
   * @deprecated
   */
  async hideKeyboard(strategy, ...possibleKeys) {
    // last parameter is the session id
    const keyNames = _.compact(possibleKeys.slice(0, -1)).map((x) => `${x}`);
    await this.mobileHideKeyboard(keyNames);
    return true;
  },

  /**
   * @this {XCUITestDriver}
   * @param {string[]} keys
   */
  async mobileHideKeyboard(keys = []) {
    if (!keys.includes('done')) {
      keys.push('done');
    }
    await this.proxyCommand('/wda/keyboard/dismiss', 'POST', {keyNames: keys});
  },

  /**
   * @this {XCUITestDriver}
   */
  async isKeyboardShown() {
    try {
      await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
      return true;
    } catch (ign) {
      return false;
    }
  },

  /**
   * Send keys to the given element or to the application under test.
   * This API is not supported on tvOS
   *
   * @since Xcode 15/iOS 17
   * @this {import('../driver').XCUITestDriver}
   * @param {(Key|string)[]} keys Array of keys to type.
   * Each item could either be a string, that represents a key itself (see
   * https://developer.apple.com/documentation/xctest/xcuielement/1500604-typekey?language=objc
   * and https://developer.apple.com/documentation/xctest/xcuikeyboardkey?language=objc)
   * or a dictionary, if the key should also be entered with modifiers.
   * @param {string?} [elementId=null] uuid of the element to send keys to.
   * If the element is not provided then the keys will be sent to the current application.
   */
  async mobileKeys(keys, elementId = null) {
    const url = `/wda/element/${elementId || 0}/keyboardInput`;
    return await this.proxyCommand(url, 'POST', { keys });
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * @typedef {import('./types').KeyboardKey} Key
 */
