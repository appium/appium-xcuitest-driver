import type {AppiumLogger} from '@appium/types';
import type {ZipConduitService as RemoteXPCZipConduitService} from 'appium-ios-remotexpc';

import {log} from '../logger';
import type {RemoteXPCFacade} from './remote-xpc';

/**
 * Options accepted by {@link ZipConduitClient.install}
 */
export interface ZipConduitInstallOptions {
  /** Maximum number of milliseconds to wait for the streamed installation to finish */
  timeoutMs?: number;
}

/**
 * Thin wrapper around the RemoteXPC streaming `zip_conduit` service.
 *
 * `zip_conduit` streams an `.ipa` straight into the on-device installer, avoiding the separate AFC upload +
 * `installation_proxy` round trip. It is RemoteXPC-only (iOS/tvOS 18+ with an
 * active tunnel) and only accepts `.ipa` archives, so callers must keep a
 * fallback for unpacked `.app` bundles and older devices.
 */
export class ZipConduitClient {
  private _lastLoggedProgress?: {percent?: number; status?: string};

  private constructor(
    private readonly service: RemoteXPCZipConduitService,
    private readonly _log: AppiumLogger = log,
  ) {}

  /**
   * Create a zip_conduit client for the device
   *
   * @param udid - Device UDID
   * @param logger - Optional logger
   * @returns A connected client, or `null` when zip_conduit is unavailable
   */
  static async create(
    udid: string,
    logger: AppiumLogger = log,
    facade: RemoteXPCFacade | null,
  ): Promise<ZipConduitClient | null> {
    const service = facade
      ? await facade.attemptService('zip_conduit', (Services) => {
          if (typeof Services.startZipConduitService !== 'function') {
            throw new Error('startZipConduitService is not available');
          }
          return Services.startZipConduitService(udid);
        })
      : null;
    if (!service) {
      return null;
    }
    return new ZipConduitClient(service, logger);
  }

  /**
   * Stream-install an `.ipa`. Handles both fresh installs and upgrades; the
   * device resolves the target by bundle id from the archive contents, so no
   * separate upgrade call is needed.
   *
   * @param ipaPath - Absolute path to the local `.ipa`
   * @param opts - Install options
   */
  async install(ipaPath: string, opts: ZipConduitInstallOptions = {}): Promise<void> {
    this._lastLoggedProgress = undefined;
    await this.service.install(ipaPath, {
      timeoutMs: opts.timeoutMs,
      progress: ({percent, status}) => this.logInstallProgress(percent, status),
    });
  }

  /**
   * Close the underlying socket.
   */
  async close(): Promise<void> {
    try {
      this.service.close();
    } catch (err: any) {
      this._log.debug(`Error closing zip_conduit service: ${err.message}`);
    }
  }

  private logInstallProgress(percent: number, status: string): void {
    if (percent === this._lastLoggedProgress?.percent && status === this._lastLoggedProgress?.status) {
      return;
    }
    this._lastLoggedProgress = {percent, status};
    this._log.debug(`App install progress: ${percent}%${status ? ` (${status})` : ''}`);
  }
}
