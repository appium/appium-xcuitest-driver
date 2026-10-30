import type {EventEmitter} from 'node:events';

import type {DVTInstruments} from 'appium-ios-remotexpc';

import {BIDI_EVENT_NAME} from '../commands/bidi/constants.js';
import {makeNetworkMonitorEvent} from '../commands/bidi/models.js';
import {DvtMonitorSession} from './dvt-monitor-session.js';

/**
 * Active DVT NetworkMonitor session: streams instrument events to the driver BiDi event bus.
 */
export class NetworkMonitorSession extends DvtMonitorSession {
  protected readonly label = 'network monitor';

  /**
   * Opens `startDVTService` and begins iterating `networkMonitor.events()`, emitting each payload on `eventEmitter`
   * using `BIDI_EVENT_NAME` and `makeNetworkMonitorEvent` (BiDi `appium:xcuitest.networkMonitor`).
   *
   * @param eventEmitter - Typically the session driver's `eventEmitter` (WebDriver BiDi bus).
   */
  async start(eventEmitter: EventEmitter): Promise<void> {
    // Start eagerly so setup failures reject the command instead of surfacing in the stream
    await this.begin(eventEmitter, (dvt) => dvt.networkMonitor.start());
  }

  protected async stopInstrument(dvt: DVTInstruments): Promise<void> {
    await dvt.networkMonitor.stop();
  }

  protected async consume(dvt: DVTInstruments, eventEmitter: EventEmitter): Promise<void> {
    for await (const event of dvt.networkMonitor.events()) {
      eventEmitter.emit(BIDI_EVENT_NAME, makeNetworkMonitorEvent(event as object));
    }
  }
}
