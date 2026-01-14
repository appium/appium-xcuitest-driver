import {INSTRUMENT_CHANNEL, services} from 'appium-ios-device';
import _ from 'lodash';
import { isIos18OrNewer, requireRealDevice } from '../utils';
import type {XCUITestDriver} from '../driver';
import type {AppiumLogger} from '@appium/types';
import type {DVTServiceWithConnection} from 'appium-ios-remotexpc';
import type {Condition} from './types';
import {getRemoteXPCServices} from '../device/remotexpc-utils';

/**
 * Abstract interface for condition inducer implementations.
 * This facade hides the differences between RemoteXPC and Instrument Service implementations.
 */
export interface IConditionInducer {
  /**
   * Lists all available condition inducers
   * @returns Array of available condition inducers
   */
  list(): Promise<Condition[]>;

  /**
   * Enables a condition inducer with the given profile
   * @param conditionID - The condition identifier (only used by Instrument Service)
   * @param profileID - The profile identifier
   * @returns `true` if enabling succeeded
   * @throws {Error} If a condition is already active
   */
  enable(conditionID: string, profileID: string): Promise<boolean>;

  /**
   * Disables the currently active condition inducer
   * @returns `true` if disabling succeeded
   */
  disable(): Promise<boolean>;

  /**
   * Closes any open connections/resources
   */
  close(): Promise<void>;

  /**
   * Checks if a condition inducer is currently active
   * @returns `true` if a condition is active
   */
  isActive(): boolean;
}

/**
 * Get all available ConditionInducer configuration information, which can be used with
 * {@linkcode XCUITestDriver.enableConditionInducer}
 * @since 4.9.0
 * @see {@link https://help.apple.com/xcode/mac/current/#/dev308429d42}
 */
export async function listConditionInducers(this: XCUITestDriver): Promise<Condition[]> {
  requireRealDevice(this, 'Condition inducer');

  return await (this._conditionInducer ?? createConditionInducer(this)).list();
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
      `Condition inducer is already running. Disable it first in order to call 'enable' again.`
    );
  }

  const facade = createConditionInducer(this);
  this._conditionInducer = facade;

  try {
    return await facade.enable(conditionID, profileID);
  } catch (err: any) {
    this._conditionInducer = null;
    try {
      await facade.close();
    } catch {}
    throw this.log.errorWithException(
      `Condition inducer '${profileID}' cannot be enabled: '${err.message}'`
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

// Private implementation classes and factory function

/**
 * RemoteXPC-based implementation for iOS 18+
 */
class RemoteXPCConditionInducer implements IConditionInducer {
  private connection: DVTServiceWithConnection | null = null;

  constructor(
    private readonly udid: string,
    private readonly log: AppiumLogger,
  ) {}

  async list(): Promise<Condition[]> {
    let connection: DVTServiceWithConnection | null = null;
    try {
      connection = await this.startConnection();
      const result = await connection.conditionInducer.list();
      return result as Condition[];
    } catch (err: any) {
      this.log.error(`Failed to list condition inducers via RemoteXPC: ${err.message}`);
      throw err;
    } finally {
      if (connection) {
        this.log.info(`Closing remoteXPC connection for device ${this.udid}`);
        await connection.remoteXPC.close();
      }
    }
  }

  async enable(conditionID: string, profileID: string): Promise<boolean> {
    if (this.connection) {
      throw new Error(
        `Condition inducer is already running. Disable it first in order to call 'enable' again.`
      );
    }

    try {
      this.connection = await this.startConnection();
      await this.connection.conditionInducer.set(profileID);
      this.log.info(`Successfully enabled condition profile: ${profileID}`);
      return true;
    } catch (err: any) {
      await this.close();
      this.log.error(`Condition inducer '${profileID}' cannot be enabled: '${err.message}'`);
      throw err;
    }
  }

  async disable(): Promise<boolean> {
    if (!this.connection) {
      this.log.warn('Condition inducer connection is not active');
      return false;
    }

    try {
      await this.connection.conditionInducer.disable();
      this.log.info('Successfully disabled condition inducer');
      return true;
    } catch (err: any) {
      this.log.warn(`Failed to disable condition inducer via RemoteXPC: ${err.message}`);
      return false;
    } finally {
      this.log.info(`Closing remoteXPC connection for device ${this.udid}`);
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.remoteXPC.close();
      this.connection = null;
    }
  }

  isActive(): boolean {
    return this.connection !== null;
  }

  private async startConnection(): Promise<DVTServiceWithConnection> {
    const Services = await getRemoteXPCServices();
    return Services.startDVTService(this.udid);
  }
}

/**
 * Instrument Service-based implementation for iOS < 18
 */
class InstrumentConditionInducer implements IConditionInducer {
  private service: any | null = null; // InstrumentService type from appium-ios-device

  constructor(
    private readonly udid: string,
    private readonly log: AppiumLogger,
  ) {}

  async list(): Promise<Condition[]> {
    const service = await services.startInstrumentService(this.udid);
    try {
      const ret = await service.callChannel(
        INSTRUMENT_CHANNEL.CONDITION_INDUCER,
        'availableConditionInducers',
      );
      return ret.selector;
    } finally {
      service.close();
    }
  }

  async enable(conditionID: string, profileID: string): Promise<boolean> {
    if (this.service && !this.service._socketClient.destroyed) {
      throw new Error(`Condition inducer has been started. A condition is already active.`);
    }

    this.service = await services.startInstrumentService(this.udid);
    const ret = await this.service.callChannel(
      INSTRUMENT_CHANNEL.CONDITION_INDUCER,
      'enableConditionWithIdentifier:profileIdentifier:',
      conditionID,
      profileID,
    );

    if (!_.isBoolean(ret.selector)) {
      this.service.close();
      this.service = null;
      throw new Error(`Enable condition inducer error: '${JSON.stringify(ret.selector)}'`);
    }

    return ret.selector;
  }

  async disable(): Promise<boolean> {
    if (!this.service) {
      this.log.warn('Condition inducer server has not started');
      return false;
    }

    try {
      const ret = await this.service.callChannel(
        INSTRUMENT_CHANNEL.CONDITION_INDUCER,
        'disableActiveCondition',
      );
      if (!_.isBoolean(ret.selector)) {
        this.log.warn(`Disable condition inducer error: '${JSON.stringify(ret.selector)}'`);
        return false;
      }
      return ret.selector;
    } finally {
      if (this.service) {
        this.service.close();
        this.service = null;
      }
    }
  }

  async close(): Promise<void> {
    if (this.service) {
      this.service.close();
      this.service = null;
    }
  }

  isActive(): boolean {
    return this.service !== null && !this.service._socketClient.destroyed;
  }
}

/**
 * Factory function to create the appropriate condition inducer implementation
 * based on the iOS version
 */
function createConditionInducer(
  driver: XCUITestDriver,
): IConditionInducer {
  if (isIos18OrNewer(driver.opts)) {
    return new RemoteXPCConditionInducer(driver.device.udid, driver.log);
  }
  return new InstrumentConditionInducer(driver.device.udid, driver.log);
}

