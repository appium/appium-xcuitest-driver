import {INSTRUMENT_CHANNEL, services} from 'appium-ios-device';
import _ from 'lodash';

const commands = {};

/**
 * @typedef {Object} ProfileList
 * @property {Array} Profile list of all profile
 */

/**
 * Get all ConditionInducer configuration information
 * We will use conditionID and profileID in the mobileEnableConditionInducer
 * @returns {ProfileList}
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
commands.mobileAvailableConditionInducer = async function availableConditionInducer () {
  this.checkCondition();
  let instrumentService;
  try {
    const instrumentService = await services.startInstrumentService(this.opts.device.udid);
    const ret = await instrumentService.callChannel(INSTRUMENT_CHANNEL.CONDITION_INDUCER, 'availableConditionInducers');
    return ret.selector;
  } finally {
    if (instrumentService) {
      instrumentService.close();
    }
  }
};

/**
 * Enable condition inducer. The socket needs to remain connected during operation
 * conditionID  ProfileList[0].identifier
 * profileID    ProfileList[0].profiles[0].identifier
 * @param {{conditionID,profileID}} options
 * @returns boolean
 */
commands.mobileEnableConditionInducer = async function enableConditionInducer (options = {}) {
  this.checkCondition();
  if (this._instrumentService && !this._instrumentService._socketClient.destroyed) {
    this.log.errorAndThrow(`Condition inducer has been started.`);
  }
  const {
    conditionID,
    profileID,
  } = options;
  this._instrumentService = await services.startInstrumentService(this.opts.device.udid);
  const ret = await this._instrumentService.callChannel(INSTRUMENT_CHANNEL.CONDITION_INDUCER,
    'enableConditionWithIdentifier:profileIdentifier:', conditionID, profileID);
  if (!_.isBoolean(ret.selector)) {
    this._instrumentService.close();
    this._instrumentService = null;
    this.log.errorAndThrow(`Enable condition inducer error: '${JSON.stringify(ret.selector)}'`);
  }
  return ret.selector;
};

/**
 * Disable condition inducer
 * @returns boolean
 */
commands.mobileDisableConditionInducer = async function disableConditionInducer () {
  this.checkCondition();
  if (!this._instrumentService) {
    this.log.errorAndThrow('Condition inducer not started or connection closed. please execute `mobile:enableConditionInducer`');
  }
  try {
    const ret = await this._instrumentService.callChannel(INSTRUMENT_CHANNEL.CONDITION_INDUCER, 'disableActiveCondition');
    return ret.selector;
  } finally {
    this._instrumentService.close();
    this._instrumentService = null;
  }
};

export {commands};
export default commands;
