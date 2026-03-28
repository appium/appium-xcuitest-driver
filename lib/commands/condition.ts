import type {XCUITestDriver} from '../driver';
import {createConditionInducer} from '../device/condition-inducer-client';
import type {Condition} from './types';
import {requireRealDevice} from '../utils';

/**
 * Get all available ConditionInducer configuration information, which can be used with
 * {@linkcode XCUITestDriver.enableConditionInducer}
 * @since 4.9.0
 * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
 */
export async function listConditionInducers(this: XCUITestDriver): Promise<Condition[]> {
  requireRealDevice(this, 'Condition inducer');

  const facade =
    this._conditionInducer ??
    (await createConditionInducer({
      udid: this.device.udid,
      log: this.log,
      platformVersion: this.opts.platformVersion,
    }));
  return await facade.list();
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

  if (this._conditionInducer?.isActive()) {
    throw this.log.errorWithException(
      `Condition inducer is already running. Disable it first in order to call 'enable' again.`,
    );
  }

  const facade = await createConditionInducer({
    udid: this.device.udid,
    log: this.log,
    platformVersion: this.opts.platformVersion,
  });
  this._conditionInducer = facade;

  try {
    return await facade.enable(conditionID, profileID);
  } catch (err: any) {
    this._conditionInducer = null;
    try {
      await facade.close();
    } catch {}
    throw this.log.errorWithException(
      `Condition inducer '${profileID}' cannot be enabled: '${err.message}'`,
    );
  }
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

  if (!this._conditionInducer) {
    this.log.warn('Condition inducer is not active');
    return false;
  }

  try {
    return await this._conditionInducer.disable();
  } finally {
    try {
      await this._conditionInducer.close();
    } catch {}
    this._conditionInducer = null;
  }
}
