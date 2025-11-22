import {INSTRUMENT_CHANNEL, services} from 'appium-ios-device';
import _ from 'lodash';
import { isIos18OrNewer } from '../utils.js';

/**
 * Get all available ConditionInducer configuration information, which can be used with
 * {@linkcode XCUITestDriver.enableConditionInducer}
 * @returns {Promise<Condition[]>}
 * @since 4.9.0
 * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
 * @this {XCUITestDriver}
 */
export async function listConditionInducers() {
  requireConditionInducerCompatibleDevice.call(this);

  if (isIos18OrNewer(this.opts)) {
    const dvtConnection = await startRemoteXPC(this.device.udid);
    try {
      const result = await dvtConnection.conditionInducer.list();
      return /** @type {Condition[]} */ (result);
    } catch (err) {
      this.log.error(`Failed to list condition inducers via RemoteXPC: ${err.message}`);
      throw err;
    } finally {
      this.log.info(`Closing remoteXPC connection for device ${this.device.udid}`);
      await dvtConnection.remoteXPC.close();
    }
  }

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
}

/**
 * Enable a "condition inducer". You can create a condition on a connected device to test your app under adverse conditions,
 * such as poor network connectivity or thermal constraints. When you start a device condition,
 * the operating system on the device behaves as if its environment has changed. The device
 * condition remains active until you stop the device condition or disconnect the device. For
 * example, you can start a device condition, run your app, monitor your app's energy usage, and
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
export async function enableConditionInducer(conditionID, profileID) {
  requireConditionInducerCompatibleDevice.call(this);

  if (isIos18OrNewer(this.opts)) {
    if (this._remoteXPCConditionInducerConnection) {
      throw this.log.errorWithException(
        `Condition inducer is already running. Disable it first in order to call enable again.`
      );
    }

    try {
      const dvtConnection = await startRemoteXPC(this.device.udid);
      this._remoteXPCConditionInducerConnection = dvtConnection;

      await dvtConnection.conditionInducer.set(profileID);

      this.log.info(`Successfully enabled condition profile: ${profileID}`);
      return true;
    } catch (err) {
      await closeRemoteXPC.call(this);
      throw this.log.errorWithException(`Condition inducer '${profileID}' cannot be enabled: '${err.message}'`);
    }
  }

  if (this._conditionInducerService && !this._conditionInducerService._socketClient.destroyed) {
    throw this.log.errorWithException(
      `Condition inducer has been started. A condition is already active.`
    );
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
    throw this.log.errorWithException(`Enable condition inducer error: '${JSON.stringify(ret.selector)}'`);
  }
  return ret.selector;
}

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
export async function disableConditionInducer() {
  requireConditionInducerCompatibleDevice.call(this);

  if (isIos18OrNewer(this.opts)) {
    if (!this._remoteXPCConditionInducerConnection) {
      this.log.warn('Condition inducer connection is not active');
      return false;
    }

    try {
      await this._remoteXPCConditionInducerConnection.conditionInducer.disable();
      this.log.info('Successfully disabled condition inducer');
      return true;
    } catch (err) {
      this.log.warn(`Failed to disable condition inducer via RemoteXPC: ${err.message}`);
      return false;
    } finally {
      this.log.info(`Closing remoteXPC connection for device ${this.device.udid}`);
      await closeRemoteXPC.call(this);
    }
  }

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
}

/**
 * @this {XCUITestDriver}
 * @returns {void}
 */
function requireConditionInducerCompatibleDevice() {
  if (this.isSimulator()) {
    throw this.log.errorWithException('Condition inducer only works on real devices');
  }
}

/**
 * @param {string} udid
 * @returns {Promise<DVTServiceWithConnection>}
 */
async function startRemoteXPC(udid) {
  const {Services} = await import('appium-ios-remotexpc');
  return Services.startDVTService(udid);
}

/**
 * @this {XCUITestDriver}
 * @returns {Promise<void>}
 */
async function closeRemoteXPC() {
  if (this._remoteXPCConditionInducerConnection) {
    await this._remoteXPCConditionInducerConnection.remoteXPC.close();
    this._remoteXPCConditionInducerConnection = null;
  }
}

/**
 * @typedef {import('appium-ios-remotexpc', {with: {'resolution-mode': 'import'}}).DVTServiceWithConnection} DVTServiceWithConnection
 */

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

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
