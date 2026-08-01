import type {EventEmitter} from 'node:events';

import type {AppiumLogger} from '@appium/types';
import type {DVTInstruments, SysmonSample} from 'appium-ios-remotexpc';

import {BIDI_EVENT_NAME} from '../commands/bidi/constants.js';
import {makeSystemMonitorEvent} from '../commands/bidi/models.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

export interface SystemMonitorSessionOptions {
  /** Sampling interval in milliseconds, forwarded to `sysmontap.configure()`. */
  intervalMs?: number;
}

/**
 * Active DVT sysmontap session: streams labelled CPU/memory/process samples to the driver BiDi event bus.
 */
export class SystemMonitorSession {
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
    private readonly remoteXPCFacade: RemoteXPCFacade | null,
  ) {}

  /**
   * @returns `true` only while the consume loop may still be receiving events (`this.dvt` is set).
   * After normal completion, error, or {@link interrupt}, this becomes `false`.
   */
  isRunning(): boolean {
    return this.dvt !== null;
  }

  /**
   * Opens `startDVTService` and begins iterating `sysmontap.messages()`, labelling each raw sample and
   * emitting it on `eventEmitter` using `BIDI_EVENT_NAME` and `makeSystemMonitorEvent`
   * (BiDi `appium:xcuitest.systemMonitor`).
   *
   * @param eventEmitter - Typically the session driver's `eventEmitter` (WebDriver BiDi bus).
   */
  async start(eventEmitter: EventEmitter, options: SystemMonitorSessionOptions = {}): Promise<void> {
    this.stopped = false;
    if (!this.remoteXPCFacade) {
      throw new Error(`RemoteXPC is not available for device '${this.udid}'`);
    }
    const dvt = await this.remoteXPCFacade.requireService('system monitor', (Services) =>
      Services.startDVTService(this.udid),
    );
    this.dvt = dvt;
    if (options.intervalMs !== undefined) {
      await dvt.sysmontap.configure({intervalMs: options.intervalMs});
    }
    this.runPromise = this.consumeEvents(dvt, eventEmitter);
  }

  /**
   * Stops monitoring and waits for the consume loop to finish. DVT is closed in
   * {@link consumeEvents} after the sysmontap iterator exits (same pattern as
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
        await dvt.sysmontap.stop();
      } catch (err: any) {
        this.log.debug(`Error stopping system monitor: ${err?.message ?? err}`);
      }
    }

    if (runPromise) {
      try {
        await runPromise;
      } catch (err: any) {
        this.log.debug(`Error while finishing system monitor consume loop: ${err?.message ?? err}`);
      }
    }
  }

  private async consumeEvents(dvt: DVTInstruments, eventEmitter: EventEmitter): Promise<void> {
    try {
      for await (const sample of dvt.sysmontap.messages()) {
        this.emitSample(dvt, sample, eventEmitter);
      }
    } catch (err: any) {
      if (!this.stopped) {
        this.log.error('System monitor stream ended unexpectedly', err);
      }
    } finally {
      await this.closeDvt(dvt);
    }
  }

  private emitSample(dvt: DVTInstruments, sample: SysmonSample, eventEmitter: EventEmitter): void {
    if (sample.System) {
      const system = zipAttributes(dvt.sysmontap.getSystemAttributes(), sample.System);
      eventEmitter.emit(BIDI_EVENT_NAME, makeSystemMonitorEvent({kind: 'system', system}));
    }

    if (sample.Processes) {
      const processAttributes = dvt.sysmontap.getProcessAttributes();
      const processes = Object.entries(sample.Processes)
        .filter(([, values]) => Array.isArray(values))
        .map(([pid, values]) => ({pid: Number(pid), ...zipAttributes(processAttributes, values)}));
      eventEmitter.emit(BIDI_EVENT_NAME, makeSystemMonitorEvent({kind: 'processes', processes}));
    }
  }

  private async closeDvt(dvt: DVTInstruments): Promise<void> {
    try {
      await dvt.dvtService.close();
    } catch (err: any) {
      this.log.debug(`Error closing DVT service for system monitor: ${err?.message ?? err}`);
    }
  }
}

/** Zip an ordered list of attribute names with a raw sysmontap value tuple. */
function zipAttributes(attributes: string[], values: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < attributes.length; i++) {
    result[attributes[i]] = values[i];
  }
  return result;
}
