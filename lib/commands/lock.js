import B from 'bluebird';

export default {
  /**
   * Lock the device (and optionally unlock the device after a certain amount of time)
   *
   * @param {number|string} [seconds] - the number of seconds after which to unlock the device. Set to `0` or leave empty to require manual unlock (do not automatically unlock).
   * @defaultValue 0
   * @this {XCUITestDriver}
   */
  async lock(seconds) {
    await this.proxyCommand('/wda/lock', 'POST');
    if (isNaN(Number(seconds))) {
      return;
    }

    const floatSeconds = parseFloat(String(seconds));
    if (floatSeconds <= 0) {
      return;
    }

    await B.delay(floatSeconds * 1000);
    await this.proxyCommand('/wda/unlock', 'POST');
  },
  /**
   * Unlock the device
   *
   * @this {XCUITestDriver}
   */
  async unlock() {
    await this.proxyCommand('/wda/unlock', 'POST');
  },
  /**
   * Determine whether the device is locked
   *
   * @this {XCUITestDriver}
   * @returns {Promise<boolean>} `true` if the device is locked, `false` otherwise
   */
  async isLocked() {
    return /** @type {boolean} */ (await this.proxyCommand('/wda/locked', 'GET'));
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
