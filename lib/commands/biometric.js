import _ from 'lodash';
import {assertSimulator as _assertSimulator} from '../utils';

const assertSimulator = _.partial(_assertSimulator, 'Biometric enrollment');

export default {
  /**
   * Enrolls biometric authentication on a simulated device.
   *
   * @param {boolean} isEnabled - Whether to enable/disable biometric enrollment.
   * @throws {Error} If enrollment fails or the device is not a Simulator.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobileEnrollBiometric(isEnabled = true) {
    assertSimulator(this);

    await /** @type {import('../driver').Simulator} */ (this.device).enrollBiometric(isEnabled);
  },

  /**
   * Emulates biometric match or non-match event on a simulated device.
   *
   * The biometric feature is expected to be already enrolled via {@linkcode mobileEnrollBiometric|mobile: enrollBiometric} before executing this.
   *
   * @param {import('./types').BiometricFeature} type - The biometric feature name.
   * @param {boolean} match - If `true`, simulate biometic match. If `false`, simulate biometric non-match.
   * @throws {Error} If matching fails or the device is not a Simulator.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobileSendBiometricMatch(type = 'touchId', match = true) {
    assertSimulator(this);

    await /** @type {import('../driver').Simulator} */ (this.device).sendBiometricMatch(match, type);
  },

  /**
   * Checks whether the biometric feature is currently enrolled on a simulated device.
   *
   * @returns {Promise<boolean>} `true` if biometric is enrolled.
   * @throws {Error} If the detection fails or the device is not a Simulator.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobileIsBiometricEnrolled() {
    assertSimulator(this);

    return await /** @type {import('../driver').Simulator} */ (this.device).isBiometricEnrolled();
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
