import {INSTRUMENT_CHANNEL, services} from 'appium-ios-device';
import _ from 'lodash';
import {util} from 'appium/support';

function requireConditionInducerCompatibleDevice(driver) {
  if (driver.isSimulator()) {
    driver.log.errorAndThrow('Condition inducer only works on real devices');
  }
  if (util.compareVersions(driver.opts.platformVersion, '<', '13.0')) {
    driver.log.errorAndThrow('Condition inducer is only supported since iOS 13+');
  }
}

/**
 * @typedef {Object} Profile
 * @property {string} name
 * @property {string} identifier the property is profileID used in {@linkcode XCUITestDriver.enableConditionInducer}
 * @property {string} description Configuration details
 */

/**
 * We can use the returned data to determine whether the Condition is enabled and the currently enabled configuration information
 * @typedef {Object} Condition
 * @property {Profile[]} profiles
 * @property {string} identifier the property is conditionID used in {@linkcode XCUITestDriver.enableConditionInducer}
 * @property {boolean} profilesSorted
 * @property {boolean} isDestructive
 * @property {boolean} isInternal
 * @property {boolean} isActive `true` if this condition identifier is enabled
 * @property {string} activeProfile  enabled profiles identifier
 * @example {
 *     "profiles": [
 *          {
 *             "name": "100% packet loss",
 *             "identifier": "SlowNetwork100PctLoss",  // MobileEnableConditionInducer profileID
 *             "description": "Name: 100% Loss Scenario\n
 *                             Downlink Bandwidth: 0 Mbps\n
 *                             Downlink Latency:0 ms\n
 *                             Downlink Packet Loss Ratio: 100%\n
 *                             Uplink Bandwidth: 0 Mbps\n
 *                             Uplink Latency: 0 ms\n
 *                             Uplink Packet Loss Ratio: 100%"
 *         }
 *     ],
 *     "profilesSorted": true,
 *     "identifier": "SlowNetworkCondition",    // MobileEnableConditionInducer conditionID
 *     "isDestructive": false,
 *     "isInternal": false,
 *     "activeProfile": "",
 *     "name": "Network Link",
 *     "isActive": false
 * }
 */

export default {
  /**
   * Get all available ConditionInducer configuration information, which can be used with
   * {@linkcode XCUITestDriver.enableConditionInducer}
   * @returns {Promise<Condition[]>}
   * @since 4.9.0
   * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
   * @this {XCUITestDriver}
   */
  async listConditionInducers() {
    requireConditionInducerCompatibleDevice(this);
    const conditionInducerService = await services.startInstrumentService(this.device.udid);
    try {
      const ret = await conditionInducerService.callChannel(
        INSTRUMENT_CHANNEL.CONDITION_INDUCER,
        'availableConditionInducers',
      );
      return ret.selector;
    } finally {
      conditionInducerService.close();
    }
  },

  /**
   * Enable a "condition inducer". You can create a condition on a connected device to test your app under adverse conditions,
   * such as poor network connectivity or thermal constraints. When you start a device condition,
   * the operating system on the device behaves as if its environment has changed. The device
   * condition remains active until you stop the device condition or disconnect the device. For
   * example, you can start a device condition, run your app, monitor your app’s energy usage, and
   * then stop the condition.
   *
   * (Note: the socket needs to remain connected during operation)
   * (Note: Device conditions are available only for real devices running iOS 13.0 and later.)
   *
   * @param {string} conditionID - Determine which condition IDs are available with the {@linkcode XCUITestDriver.listConditionInducers} command
   * @param {string} profileID - Determine which profile IDs are available with the {@linkcode XCUITestDriver.listConditionInducers} command
   * @returns {Promise<boolean>} `true` if enabling the condition succeeded
   * @throws {Error} If you try to start another Condition and the previous Condition has not stopped
   * @since 4.9.0
   * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
   * @this {XCUITestDriver}
   */
  async enableConditionInducer(conditionID, profileID) {
    requireConditionInducerCompatibleDevice(this);
    if (this._conditionInducerService && !this._conditionInducerService._socketClient.destroyed) {
      this.log.errorAndThrow(`Condition inducer has been started. A condition is already active.`);
    }
    this._conditionInducerService = await services.startInstrumentService(this.device.udid);
    const ret = await this._conditionInducerService.callChannel(
      INSTRUMENT_CHANNEL.CONDITION_INDUCER,
      'enableConditionWithIdentifier:profileIdentifier:',
      conditionID,
      profileID,
    );
    if (!_.isBoolean(ret.selector)) {
      this._conditionInducerService.close();
      this._conditionInducerService = null;
      this.log.errorAndThrow(`Enable condition inducer error: '${JSON.stringify(ret.selector)}'`);
    }
    return ret.selector;
  },

  /**
   * Disable a condition inducer enabled with {@linkcode XCUITestDriver.enableConditionInducer} Usually
   * a persistent connection is maintained after the condition inducer is enabled, and this method
   * is only valid for the currently enabled connection. If the connection is disconnected, the
   * condition inducer will be automatically disabled
   *
   * (Note: this is also automatically called upon session cleanup)
   * @returns {Promise<boolean>} `true` if disable the condition succeeded
   * @since 4.9.0
   * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
   * @this {XCUITestDriver}
   */
  async disableConditionInducer() {
    if (!this._conditionInducerService) {
      this.log.warn('Condition inducer server is not started');
      return false;
    }
    try {
      const ret = await this._conditionInducerService.callChannel(
        INSTRUMENT_CHANNEL.CONDITION_INDUCER,
        'disableActiveCondition',
      );
      if (!_.isBoolean(ret.selector)) {
        this.log.warn(`Disable condition inducer error: '${JSON.stringify(ret.selector)}'`);
        return false;
      }
      return ret.selector;
    } finally {
      if (this._conditionInducerService) {
        this._conditionInducerService.close();
        this._conditionInducerService = null;
      }
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
