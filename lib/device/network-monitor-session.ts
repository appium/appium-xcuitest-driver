import type {AppiumLogger} from '@appium/types';
import type {EventEmitter} from 'node:events';
import type {DVTInstruments} from 'appium-ios-remotexpc';
import {makeNetworkMonitorEvent} from '../commands/bidi/models';
import {BIDI_EVENT_NAME} from '../commands/bidi/constants';
import {getRemoteXPCServices} from './remotexpc-utils';

/**
 * Active DVT NetworkMonitor session: streams instrument events to the driver BiDi event bus.
 */
export class NetworkMonitorSession {
  private dvt: DVTInstruments | null = null;
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
   * @returns `true` only while the consume loop may still be receiving events (`this.dvt` is set).
   * After normal completion, error, or {@link interrupt}, this becomes `false`.
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
   * Stops monitoring and waits for the consume loop to finish. DVT is closed in
   * {@link consumeEvents} after the network monitor iterator exits (same pattern as
   * condition inducer `disable()` → `close()`).
   */
  async interrupt(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    const dvt = this.dvt;
    const runPromise = this.runPromise;
    this.dvt = null;
    this.runPromise = null;

    if (dvt) {
      try {
        await dvt.networkMonitor.stop();
      } catch (err: any) {
        this.log.debug(`Error stopping network monitor: ${err?.message ?? err}`);
      }
    }

    if (runPromise) {
      try {
        await runPromise;
      } catch (err: any) {
        this.log.debug(
          `Error while finishing network monitor consume loop: ${err?.message ?? err}`,
        );
      }
    }
  }

  private async consumeEvents(dvt: DVTInstruments, eventEmitter: EventEmitter): Promise<void> {
    try {
      for await (const event of dvt.networkMonitor.events()) {
        eventEmitter.emit(BIDI_EVENT_NAME, makeNetworkMonitorEvent(event as object));
      }
    } catch (err: any) {
      if (!this.stopped) {
        this.log.error('Network monitor stream ended unexpectedly', err);
      }
    } finally {
      await this.closeDvt(dvt);
    }
  }

  private async closeDvt(dvt: DVTInstruments): Promise<void> {
    try {
      await dvt.dvtService.close();
    } catch (err: any) {
      this.log.debug(`Error closing DVT service for network monitor: ${err?.message ?? err}`);
    }
  }
}
