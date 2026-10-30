import type {EventEmitter} from 'node:events';

import type {DVTInstruments, SysmonSample} from 'appium-ios-remotexpc';

import {BIDI_EVENT_NAME} from '../commands/bidi/constants.js';
import {makeSystemMonitorEvent} from '../commands/bidi/models.js';
import {DvtMonitorSession} from './dvt-monitor-session.js';

export interface SystemMonitorSessionOptions {
  /** Sampling interval in milliseconds, forwarded to `sysmontap.configure()`. */
  intervalMs?: number;
}

/**
 * Active DVT sysmontap session: streams labelled CPU/memory/process samples to the driver BiDi event bus.
 */
export class SystemMonitorSession extends DvtMonitorSession {
  protected readonly label = 'system monitor';

  /**
   * Opens `startDVTService` and begins iterating `sysmontap.messages()`, labelling each raw sample and
   * emitting it on `eventEmitter` using `BIDI_EVENT_NAME` and `makeSystemMonitorEvent`
   * (BiDi `appium:xcuitest.systemMonitor`).
   *
   * @param eventEmitter - Typically the session driver's `eventEmitter` (WebDriver BiDi bus).
   */
  async start(eventEmitter: EventEmitter, options: SystemMonitorSessionOptions = {}): Promise<void> {
    await this.begin(eventEmitter, async (dvt) => {
      if (options.intervalMs !== undefined) {
        await dvt.sysmontap.configure({intervalMs: options.intervalMs});
      }
      // Start eagerly so setup failures reject the command instead of surfacing in the stream
      await dvt.sysmontap.start();
    });
  }

  protected async stopInstrument(dvt: DVTInstruments): Promise<void> {
    await dvt.sysmontap.stop();
  }

  protected async consume(dvt: DVTInstruments, eventEmitter: EventEmitter): Promise<void> {
    for await (const sample of dvt.sysmontap.messages()) {
      this.emitSample(dvt, sample, eventEmitter);
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
}

/** Zip an ordered list of attribute names with a raw sysmontap value tuple. */
function zipAttributes(attributes: string[], values: unknown[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (let i = 0; i < attributes.length; i++) {
    result[attributes[i]] = values[i];
  }
  return result;
}
