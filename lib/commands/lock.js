import B from 'bluebird';

export default {
  /**
   * @param {number|string} seconds
   * @this {XCUITestDriver}
   */
  async lock(seconds) {
    await this.proxyCommand('/wda/lock', 'POST');
    if (isNaN(seconds)) {
      return;
    }

    const floatSeconds = parseFloat(/** @type {string} */(seconds));
    if (floatSeconds <= 0) {
      return;
    }

    await B.delay(floatSeconds * 1000);
    await this.proxyCommand('/wda/unlock', 'POST');
  },
  /**
   * @this {XCUITestDriver}
   */
  async unlock() {
    await this.proxyCommand('/wda/unlock', 'POST');
  },
  /**
   * @this {XCUITestDriver}
   * @returns {Promise<boolean>}
   */
  async isLocked() {
    return await this.proxyCommand('/wda/locked', 'GET');
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
