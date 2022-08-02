import { INSTRUMENT_CHANNEL, services } from 'appium-ios-device';
import _ from 'lodash';
import { util } from 'appium/support';

const commands = {};

function requireConditionInducerCompatibleDevice (driver) {
    if (driver.isSimulator()) {
      driver.log.errorAndThrow('Condition inducer only works on real devices');
    }
    if (util.compareVersions(driver.opts.platformVersion, '<', '13.0')) {
      driver.log.errorAndThrow('Condition inducer is only supported since iOS 13+');
    }
  }

/**
 * @typedef {Object} Profile
 * @property {String} name
 * @property {String} identifier  the property is profileID used in MobileEnableConditionInducer
 * @property {String} description Configuration details
 */

/**
 * We can use the returned data to determine whether the Condition is enabled and the currently enabled configuration information
 * @typedef {Object} Condition
 * @property {Array<Profile>} profiles
 * @property {String} identifier the property is conditionID used in MobileEnableConditionInducer
 * @property {boolean} profilesSorted
 * @property {boolean} isDestructive
 * @property {boolean} isInternal
 * @property {boolean} isActive `true` if this condition identifier is enabled
 * @property {String} activeProfile  enabled profiles identifier
 */

/**
 * Get all ConditionInducer configuration information
 * We will use conditionID and profileID in the mobileEnableConditionInducer
 * @returns {Array<Condition>}
 * [{
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
 * }]
 */
commands.mobileListConditionInducers = async function listConditionInducers () {
  requireConditionInducerCompatibleDevice(this);
  const conditionInducerService = await services.startInstrumentService(this.opts.device.udid);
  try {
    const ret = await conditionInducerService.callChannel(INSTRUMENT_CHANNEL.CONDITION_INDUCER, 'availableConditionInducers');
    return ret.selector;
  } finally {
    conditionInducerService.close();
  }
};

/**
 * Enable condition inducer. The socket needs to remain connected during operation
 * conditionID  Condition[0].identifier
 * profileID    Condition[0].profiles[0].identifier
 * @param {{conditionID,profileID}} options
 * @returns {boolean} `true` if enable the condition succeeded
 * @throws {Error} If try to start another Condition and the previous Condition has not stopped, it will throw an error
 */
commands.mobileEnableConditionInducer = async function enableConditionInducer (options = {}) {
  requireConditionInducerCompatibleDevice(this);
  if (this._conditionInducerService && !this._conditionInducerService._socketClient.destroyed) {
    this.log.errorAndThrow(`Condition inducer has been started. A condition is already active.`);
  }
  const {
    conditionID,
    profileID,
  } = options;
  this._conditionInducerService = await services.startInstrumentService(this.opts.device.udid);
  const ret = await this._conditionInducerService.callChannel(INSTRUMENT_CHANNEL.CONDITION_INDUCER,
    'enableConditionWithIdentifier:profileIdentifier:', conditionID, profileID);
  if (!_.isBoolean(ret.selector)) {
    this._conditionInducerService.close();
    this._conditionInducerService = null;
    this.log.errorAndThrow(`Enable condition inducer error: '${JSON.stringify(ret.selector)}'`);
  }
  return ret.selector;
};

/**
 * Disable condition inducer
 * this call upon driver deletion
 * @returns {boolean} `true` if disable the condition succeeded
 */
commands.mobileDisableConditionInducer = async function disableConditionInducer () {
  if (!this._conditionInducerService) {
    this.log.warn('Condition inducer server is not started');
    return false;
  }
  try {
    const ret = await this._conditionInducerService.callChannel(INSTRUMENT_CHANNEL.CONDITION_INDUCER, 'disableActiveCondition');
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
};

export {commands};
export default commands;
