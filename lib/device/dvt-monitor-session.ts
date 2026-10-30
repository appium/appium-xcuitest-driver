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
  private startPromise: Promise<boolean> | null = null;
  private generation = 0;
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

  /** @returns `true` while starting or while the consume loop may still receive events. */
  isRunning(): boolean {
    return this.startPromise !== null || this.dvt !== null;
  }

  /**
   * Opens the DVT service, runs `prepare`, then starts consuming. Resolves immediately if already
   * streaming. A call made during an in-flight start waits for it and shares its outcome.
   * Rejects (after closing the service) if `prepare` fails.
   *
   * @param prepare - Instrument setup; it should bail out once `isCancelled()` returns `true`.
   */
  protected async begin(
    eventEmitter: EventEmitter,
    prepare?: (dvt: DVTInstruments, isCancelled: () => boolean) => Promise<void>,
  ): Promise<void> {
    const generation = this.generation;
    for (;;) {
      if (this.startPromise) {
        if (await this.startPromise) {
          return;
        }
        // The awaited start was cancelled: retry only if no interrupt() came after this call
        if (this.generation !== generation) {
          return;
        }
      } else if (this.dvt) {
        return;
      } else {
        this.stopped = false;
        this.startPromise = this.runOpen(eventEmitter, prepare);
        await this.startPromise;
        return;
      }
    }
  }

  /** Runs {@link open} and clears `startPromise` before any waiter resumes. */
  private async runOpen(
    eventEmitter: EventEmitter,
    prepare?: (dvt: DVTInstruments, isCancelled: () => boolean) => Promise<void>,
  ): Promise<boolean> {
    try {
      return await this.open(eventEmitter, prepare);
    } finally {
      this.startPromise = null;
    }
  }

  /** @returns `true` if streaming began, `false` if the start was cancelled by {@link interrupt}. */
  private async open(
    eventEmitter: EventEmitter,
    prepare?: (dvt: DVTInstruments, isCancelled: () => boolean) => Promise<void>,
  ): Promise<boolean> {
    if (!this.remoteXPCFacade) {
      throw new Error(`RemoteXPC is not available for device '${this.udid}'`);
    }
    const dvt = await this.remoteXPCFacade.requireTunnelService(this.label, (Services) =>
      Services.startDVTService(this.udid),
    );
    if (this.stopped) {
      // interrupt() ran while the service was being opened
      await this.closeDvt(dvt);
      return false;
    }
    this.dvt = dvt;
    try {
      await prepare?.(dvt, () => this.isCancelled(dvt));
    } catch (err) {
      if (this.isCancelled(dvt)) {
        // interrupt() already closed the service; the cancelled start isn't an error
        return false;
      }
      this.dvt = null;
      await this.closeDvt(dvt);
      throw err;
    }
    if (this.isCancelled(dvt)) {
      return false;
    }
    this.runPromise = this.consumeEvents(dvt, eventEmitter);
    return true;
  }

  /** Stops monitoring and waits for the consume loop; closes DVT here if streaming never began. */
  async interrupt(): Promise<void> {
    if (this.stopped) {
      return;
    }

    this.stopped = true;
    this.generation++;
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

  /** @returns `true` if {@link interrupt} has detached `dvt`, so setup should stop early. */
  private isCancelled(dvt: DVTInstruments): boolean {
    return this.dvt !== dvt;
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
