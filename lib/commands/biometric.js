function assertIsSimulator(driver) {
  if (!driver.isSimulator()) {
    throw new Error('Biometric enrollment can only be performed on Simulator');
  }
}

export default {
  /**
   * Enrolls biometric authentication on Simulator.
   *
   * @param {EnrollOptions} [opts] - Enrollment options.
   * @throws {Error} If enrollment fails or the device is not a Simulator.
   * @this {XCUITestDriver}
   */
  async mobileEnrollBiometric(opts = {}) {
    const {isEnabled = true} = opts;

    assertIsSimulator(this);

    await this.opts.device.enrollBiometric(isEnabled);
  },

  /**
   * Emulates biometric match/non-match event on Simulator.
   * The biometric feature is expected to be already enrolled before executing that.
   *
   * @param {BiometricMatchOptions} [opts] - Matching options.
   * @throws {Error} If matching fails or the device is not a Simulator.
   * @this {XCUITestDriver}
   */
  async mobileSendBiometricMatch(opts = {}) {
    const {match = true, type = 'touchId'} = opts;

    assertIsSimulator(this);

    await this.opts.device.sendBiometricMatch(match, type);
  },

  /**
   * Checks whether biometric is currently enrolled or not.
   *
   * @return {boolean} True if biometric is enrolled.
   * @throws {Error} If the detection fails or the device is not a Simulator.
   * @this {XCUITestDriver}
   */
  async mobileIsBiometricEnrolled() {
    assertIsSimulator(this);

    return await this.opts.device.isBiometricEnrolled();
  },
};

/**
 * @typedef EnrollOptions
 * @property {boolean} [isEnabled=true] - Whether to enable/disable biometric enrollment.
 */

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * @typedef {Object} BiometricMatchOptions
 * @property {string} [type=touchId] - The biometric feature name.
 * @property {boolean} [match=true] - Whether to simulate biometric match or non-match.
 */
