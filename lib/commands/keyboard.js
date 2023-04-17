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
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
