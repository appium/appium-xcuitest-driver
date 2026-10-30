import type {EventEmitter} from 'node:events';

import type {AppiumLogger} from '@appium/types';
import type {DVTInstruments} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Base for DVT instrument sessions that stream events to the driver BiDi event bus.
 */
export abstract class DvtMonitorSession {
  private dvt: DVTInstruments | null = null;
  private runPromise: Promise<void> | null = null;
  private stopped = false;

  /**
   * @param log - Logger for this session (typically the driver logger).
   * @param udid - Target device UDID for `startDVTService`.
   */
  constructor(
    protected readonly log: AppiumLogger,
    protected readonly udid: string,
    private readonly remoteXPCFacade: RemoteXPCFacade | null,
  ) {}

  /** Human-readable monitor name used in logs and tunnel errors, e.g. `network monitor`. */
  protected abstract readonly label: string;

  /** Asks the instrument to stop, which unblocks {@link consume}. */
  protected abstract stopInstrument(dvt: DVTInstruments): Promise<void>;

  /** Iterates the instrument stream until it ends, emitting each item on `eventEmitter`. */
  protected abstract consume(dvt: DVTInstruments, eventEmitter: EventEmitter): Promise<void>;

  /**
   * @returns `true` only while the consume loop may still be receiving events (`this.dvt` is set).
   * After normal completion, error, or {@link interrupt}, this becomes `false`.
   */
  isRunning(): boolean {
    return this.dvt !== null;
  }

  /**
   * Opens `startDVTService`, runs `prepare` and begins consuming the instrument stream.
   * A `prepare` failure closes the DVT service and is rethrown, so the caller sees start errors.
   * Does nothing if the session is already running.
   *
   * @param eventEmitter - Typically the session driver's `eventEmitter` (WebDriver BiDi bus).
   * @param prepare - Optional instrument setup that must complete before streaming begins.
   */
  protected async begin(eventEmitter: EventEmitter, prepare?: (dvt: DVTInstruments) => Promise<void>): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    this.stopped = false;
    if (!this.remoteXPCFacade) {
      throw new Error(`RemoteXPC is not available for device '${this.udid}'`);
    }
    const dvt = await this.remoteXPCFacade.requireTunnelService(this.label, (Services) =>
      Services.startDVTService(this.udid),
    );
    if (this.stopped) {
      // interrupt() ran while the service was being opened
      await this.closeDvt(dvt);
      return;
    }
    this.dvt = dvt;
    try {
      await prepare?.(dvt);
    } catch (err) {
      if (this.dvt === dvt) {
        this.dvt = null;
      }
      await this.closeDvt(dvt);
      throw err;
    }
    if (this.dvt !== dvt) {
      // interrupt() ran during prepare and already closed the service
      return;
    }
    this.runPromise = this.consumeEvents(dvt, eventEmitter);
  }

  /**
   * Stops monitoring and waits for the consume loop to finish. DVT is closed by the consume loop,
   * or here if streaming never began.
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
        await this.stopInstrument(dvt);
      } catch (err: any) {
        this.log.debug(`Error stopping ${this.label}: ${err?.message ?? err}`);
      }
    }

    if (runPromise) {
      try {
        await runPromise;
      } catch (err: any) {
        this.log.debug(`Error while finishing ${this.label} consume loop: ${err?.message ?? err}`);
      }
    } else if (dvt) {
      await this.closeDvt(dvt);
    }
  }

  private async consumeEvents(dvt: DVTInstruments, eventEmitter: EventEmitter): Promise<void> {
    try {
      await this.consume(dvt, eventEmitter);
      if (!this.stopped) {
        this.log.warn(`The ${this.label} stream ended unexpectedly; call start again to resume`);
      }
    } catch (err: any) {
      if (!this.stopped) {
        this.log.error(`The ${this.label} stream ended unexpectedly; call start again to resume`, err);
      }
    } finally {
      // Reset before closing so a new start() isn't skipped while the close is in flight
      if (this.dvt === dvt) {
        this.dvt = null;
        this.runPromise = null;
      }
      await this.closeDvt(dvt);
    }
  }

  private async closeDvt(dvt: DVTInstruments): Promise<void> {
    try {
      await dvt.dvtService.close();
    } catch (err: any) {
      this.log.debug(`Error closing DVT service for ${this.label}: ${err?.message ?? err}`);
    }
  }
}
