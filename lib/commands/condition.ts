import {INSTRUMENT_CHANNEL, services} from 'appium-ios-device';
import _ from 'lodash';
import { isIos18OrNewer, requireRealDevice } from '../utils';
import type {XCUITestDriver} from '../driver';
import type {DVTServiceWithConnection} from 'appium-ios-remotexpc';
import type {Condition} from './types';

/**
 * Get all available ConditionInducer configuration information, which can be used with
 * {@linkcode XCUITestDriver.enableConditionInducer}
 * @since 4.9.0
 * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
 */
export async function listConditionInducers(this: XCUITestDriver): Promise<Condition[]> {
  requireRealDevice(this, 'Condition inducer');

  if (isIos18OrNewer(this.opts)) {
    const dvtConnection = await startRemoteXPC(this.device.udid);
    try {
      const result = await dvtConnection.conditionInducer.list();
      return result as Condition[];
    } catch (err: any) {
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
 * @param conditionID - Determine which condition IDs are available with the {@linkcode XCUITestDriver.listConditionInducers} command
 * @param profileID - Determine which profile IDs are available with the {@linkcode XCUITestDriver.listConditionInducers} command
 * @returns `true` if enabling the condition succeeded
 * @throws {Error} If you try to start another Condition and the previous Condition has not stopped
 * @since 4.9.0
 * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
 */
export async function enableConditionInducer(
  this: XCUITestDriver,
  conditionID: string,
  profileID: string,
): Promise<boolean> {
  requireRealDevice(this, 'Condition inducer');

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
    } catch (err: any) {
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
 * @returns `true` if disable the condition succeeded
 * @since 4.9.0
 * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
 */
export async function disableConditionInducer(this: XCUITestDriver): Promise<boolean> {
  requireRealDevice(this, 'Condition inducer');

  if (isIos18OrNewer(this.opts)) {
    if (!this._remoteXPCConditionInducerConnection) {
      this.log.warn('Condition inducer connection is not active');
      return false;
    }

    try {
      await this._remoteXPCConditionInducerConnection.conditionInducer.disable();
      this.log.info('Successfully disabled condition inducer');
      return true;
    } catch (err: any) {
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

async function startRemoteXPC(udid: string): Promise<DVTServiceWithConnection> {
  const {Services} = await import('appium-ios-remotexpc');
  return Services.startDVTService(udid);
}

async function closeRemoteXPC(this: XCUITestDriver): Promise<void> {
  if (this._remoteXPCConditionInducerConnection) {
    await this._remoteXPCConditionInducerConnection.remoteXPC.close();
    this._remoteXPCConditionInducerConnection = null;
  }
}


