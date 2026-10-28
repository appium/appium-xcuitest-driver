import type {AppiumLogger} from '@appium/types';
import type {DVTInstruments} from 'appium-ios-remotexpc';

import type {Condition, IConditionInducer} from '../types.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * RemoteXPC-based (DVT) condition inducer. Tunnel only.
 */
class RemoteXPCConditionInducer implements IConditionInducer {
  private connection: DVTInstruments | null = null;

  constructor(
    private readonly udid: string,
    private readonly log: AppiumLogger,
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  async list(): Promise<Condition[]> {
    let connection: DVTInstruments | null = null;
    try {
      connection = await this.startConnection();
      const result = await connection.conditionInducer.list();
      return result as Condition[];
    } catch (err: any) {
      this.log.error(`Failed to list condition inducers via RemoteXPC: ${err.message}`);
      throw err;
    } finally {
      if (connection) {
        this.log.info(`Closing DVT service connection for device ${this.udid}`);
        await connection.dvtService.close();
      }
    }
  }

  async enable(_conditionID: string, profileID: string): Promise<boolean> {
    if (this.connection) {
      throw new Error(`Condition inducer is already running. Disable it first in order to call 'enable' again.`);
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
      this.log.info(`Closing DVT service connection for device ${this.udid}`);
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.dvtService.close();
      this.connection = null;
    }
  }

  isActive(): boolean {
    return this.connection !== null;
  }

  async startConnection(): Promise<DVTInstruments> {
    return this.remoteXPCFacade.requireTunnelService('condition inducer', (Services) =>
      Services.startDVTService(this.udid),
    );
  }
}

/**
 * Creates a condition inducer for the session.
 *
 * @throws {TunnelRequiredError} When the session runs without a RemoteXPC tunnel
 */
export async function createConditionInducer(params: {
  udid: string;
  log: AppiumLogger;
  remoteXPCFacade: RemoteXPCFacade;
}): Promise<IConditionInducer> {
  const {udid, log, remoteXPCFacade} = params;
  await remoteXPCFacade.assertTunnelTier('condition inducer');
  return new RemoteXPCConditionInducer(udid, log, remoteXPCFacade);
}
