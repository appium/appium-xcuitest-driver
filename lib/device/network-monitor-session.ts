import type {AppiumLogger} from '@appium/types';
import type {EventEmitter} from 'node:events';
import type {DVTServiceWithConnection} from 'appium-ios-remotexpc';
import {makeNetworkMonitorEvent} from '../commands/bidi/models';
import {BIDI_EVENT_NAME} from '../commands/bidi/constants';
import {getRemoteXPCServices} from './remotexpc-utils';

/**
 * Active DVT NetworkMonitor session: streams instrument events to the driver BiDi event bus.
 */
export class NetworkMonitorSession {
  private dvt: DVTServiceWithConnection | null = null;
  private runPromise: Promise<void> | null = null;
  private stopped = false;

  /**
   * @param log - Logger for this session (typically the driver logger).
   * @param udid - Target device UDID for `startDVTService`.
   */
  constructor(
    private readonly log: AppiumLogger,
    private readonly udid: string,
  ) {}


  /**
   * @returns `true` while a DVT connection is held and the event loop may still be active.
   */
  isRunning(): boolean {
    return this.dvt !== null;
  }

  /**
   * Opens `startDVTService` and begins iterating `networkMonitor.events()`, emitting each payload on `eventEmitter`
   * using `BIDI_EVENT_NAME` and `makeNetworkMonitorEvent` (BiDi `appium:xcuitest.networkMonitor`).
   *
   * @param eventEmitter - Typically the session driver's `eventEmitter` (WebDriver BiDi bus).
   */
  async start(eventEmitter: EventEmitter): Promise<void> {
    this.stopped = false;
    const Services = await getRemoteXPCServices();
    const dvt = await Services.startDVTService(this.udid);
    this.dvt = dvt;
    this.runPromise = this.consumeEvents(dvt, eventEmitter);
  }

  /**
   * Stops monitoring: closes Remote XPC (same pattern as other `startDVTService` call sites in this driver),
   * then awaits the background consume loop. Safe to call more than once.
   */
  async interrupt(): Promise<void> {
    if (!this.dvt) {
      return;
    }

    this.stopped = true;
    const dvt = this.dvt;
    this.dvt = null;
    // Same as other `startDVTService` paths in this driver (condition inducer, terminateAppRemoteXPC):
    // close RemoteXPC only. Remotexpc's DVT integration tests often call `dvtService.close()` first for
    // explicit channel teardown; we can add that if shutdown issues show up in the field.
    try {
      await dvt.remoteXPC.close();
    } catch (err: any) {
      this.log.debug(`Error closing RemoteXPC for network monitor: ${err?.message ?? err}`);
    }
    if (this.runPromise) {
      await this.runPromise.catch(() => {});
      this.runPromise = null;
    }
  }

  private async consumeEvents(
    dvt: DVTServiceWithConnection,
    eventEmitter: EventEmitter,
  ): Promise<void> {
    try {
      for await (const event of dvt.networkMonitor.events()) {
        eventEmitter.emit(BIDI_EVENT_NAME, makeNetworkMonitorEvent(event as object));
      }
    } catch (err: any) {
      if (!this.stopped) {
        this.log.warn(`Network monitor stream ended: ${err?.message ?? err}`);
      }
    }
  }
}
