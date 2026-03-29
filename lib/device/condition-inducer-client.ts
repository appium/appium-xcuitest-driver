import {INSTRUMENT_CHANNEL, services} from 'appium-ios-device';
import type {AppiumLogger} from '@appium/types';
import {isIos18OrNewerPlatform} from '../utils';
import type {DVTServiceWithConnection} from 'appium-ios-remotexpc';
import type {Condition, IConditionInducer} from '../types';
import {getRemoteXPCServices} from './remotexpc-utils';

/**
 * Picks RemoteXPC when the platform is iOS/tvOS 18+ and probe succeeds; otherwise legacy instrument service.
 */
export async function createConditionInducer(params: {
  udid: string;
  log: AppiumLogger;
  platformVersion?: string;
}): Promise<IConditionInducer> {
  const {udid, log, platformVersion} = params;

  if (!isIos18OrNewerPlatform(platformVersion)) {
    return new InstrumentConditionInducer(udid, log);
  }

  const xpcInducer = new RemoteXPCConditionInducer(udid, log);
  try {
    const connection = await xpcInducer.startConnection();
    await connection.remoteXPC.close();
  } catch (err: any) {
    log.warn(
      `Unable to use RemoteXPC-based condition inducer for device ${udid}, ` +
        `falling back to the legacy implementation: ${err.message}`,
    );
    return new InstrumentConditionInducer(udid, log);
  }
  return xpcInducer;
}

/**
 * RemoteXPC-based implementation for iOS 18+.
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

  async enable(_conditionID: string, profileID: string): Promise<boolean> {
    if (this.connection) {
      throw new Error(
        `Condition inducer is already running. Disable it first in order to call 'enable' again.`,
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

  async startConnection(): Promise<DVTServiceWithConnection> {
    const Services = await getRemoteXPCServices();
    return Services.startDVTService(this.udid);
  }
}

/**
 * Instrument service implementation (appium-ios-device) for iOS &lt; 18 and RemoteXPC fallback.
 */
class InstrumentConditionInducer implements IConditionInducer {
  private service: InstrumentService | null = null;

  constructor(
    private readonly udid: string,
    private readonly log: AppiumLogger,
  ) {}

  async list(): Promise<Condition[]> {
    const service = (await services.startInstrumentService(this.udid)) as InstrumentService;
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

    this.service = (await services.startInstrumentService(this.udid)) as InstrumentService;
    const ret = await this.service.callChannel(
      INSTRUMENT_CHANNEL.CONDITION_INDUCER,
      'enableConditionWithIdentifier:profileIdentifier:',
      conditionID,
      profileID,
    );

    if (typeof ret.selector !== 'boolean') {
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
      if (typeof ret.selector !== 'boolean') {
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

type InstrumentService = {
  callChannel(channel: string, method: string, ...args: any[]): Promise<{selector: any}>;
  close(): void;
  _socketClient: {destroyed: boolean};
};
