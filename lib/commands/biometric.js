function assertIsSimulator(driver) {
  if (!driver.isSimulator()) {
    throw new Error('Biometric enrollment can only be performed on Simulator');
  }
}

export default {
  /**
   * Enrolls biometric authentication on Simulator.
   *
   * @param {boolean} isEnabled - Whether to enable/disable biometric enrollment.
   * @throws {Error} If enrollment fails or the device is not a Simulator.
   * @group Simulatory Only
   * @this {XCUITestDriver}
   */
  async mobileEnrollBiometric(isEnabled = true) {
    assertIsSimulator(this);

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    await this.opts.device.enrollBiometric(isEnabled);
  },

  /**
   * Emulates biometric match/non-match event on Simulator.
   * The biometric feature is expected to be already enrolled before executing this.
   *
   * @param {string} type - The biometric feature name.
   * @param {boolean} match - If `true`, simulate biometic match. If `false`, simulate biometric non-match..
   * @throws {Error} If matching fails or the device is not a Simulator.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobileSendBiometricMatch(type = 'touchId', match = true) {
    assertIsSimulator(this);

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    await this.opts.device.sendBiometricMatch(match, type);
  },

  /**
   * Checks whether biometric is currently enrolled or not.
   *
   * @returns {Promise<boolean>} `true` if biometric is enrolled.
   * @throws {Error} If the detection fails or the device is not a Simulator.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobileIsBiometricEnrolled() {
    assertIsSimulator(this);

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.isBiometricEnrolled();
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
