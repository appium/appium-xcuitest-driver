import type {AppiumLogger} from '@appium/types';
import {getRemoteXPCServices} from './remotexpc-utils';
import type {CertificateList} from '../commands/types';
import type {
  MobileConfigService as RemoteXPCMobileConfigService,
  RemoteXpcConnection,
} from 'appium-ios-remotexpc';

/**
 * Options for installing a certificate
 */
export interface InstallCertificateOptions {
  payload: Buffer;
}

/**
 * Certificate (MDM profile) operations on real devices using RemoteXPC.
 *
 * Requires **iOS/tvOS 18+**, the optional **`appium-ios-remotexpc`** package, and
 * {@link CertificateClient.create} to be called with `useRemoteXPC: true` (typically from
 * `isIos18OrNewer` after session startup).
 */
export class CertificateClient {
  private readonly mobileConfigService: RemoteXPCMobileConfigService;
  private readonly remoteXPCConnection: RemoteXpcConnection;
  private readonly log: AppiumLogger;

  private constructor(
    mobileConfigService: RemoteXPCMobileConfigService,
    log: AppiumLogger,
    remoteXPCConnection: RemoteXpcConnection,
  ) {
    this.mobileConfigService = mobileConfigService;
    this.log = log;
    this.remoteXPCConnection = remoteXPCConnection;
  }

  /**
   * Opens a RemoteXPC mobile config service for the given device.
   *
   * @param udid - Device UDID
   * @param log - Appium logger instance
   * @param useRemoteXPC - Must be `true` for this client; callers derive this from `isIos18OrNewer(opts)` after `start()`
   * @throws {Error} If `useRemoteXPC` is false, or RemoteXPC/mobile config setup fails
   */
  static async create(
    udid: string,
    log: AppiumLogger,
    useRemoteXPC: boolean,
  ): Promise<CertificateClient> {
    if (!useRemoteXPC) {
      throw new Error(
        'Real device SSL/certificate operations require iOS/tvOS 18 or newer with the optional ' +
          'appium-ios-remotexpc package. Support for py-ios-device was removed in driver v11.',
      );
    }

    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const Services = await getRemoteXPCServices();
      const {mobileConfigService, remoteXPC} = await Services.startMobileConfigService(udid);
      remoteXPCConnection = remoteXPC;
      const client = new CertificateClient(mobileConfigService, log, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      throw new Error(
        `Failed to start RemoteXPC mobile config service for certificate operations: ${err.message}. ` +
          'Ensure appium-ios-remotexpc is installed and the device is supported.',
      );
    } finally {
      if (remoteXPCConnection && !succeeded) {
        try {
          await remoteXPCConnection.close();
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Install a certificate / profile from a PEM payload buffer.
   */
  async installCertificate(options: InstallCertificateOptions): Promise<void> {
    const {payload} = options;
    await this.mobileConfigService.installProfileFromBuffer(payload);
  }

  /**
   * Remove a profile by name.
   *
   * @param name - Profile identifier to remove
   * @returns `'Acknowledged'` when the service accepts the removal request
   */
  async removeCertificate(name: string): Promise<string> {
    await this.mobileConfigService.removeProfile(name);
    return 'Acknowledged';
  }

  /**
   * @returns Installed profiles metadata from the device
   */
  async listCertificates(): Promise<CertificateList> {
    return await this.mobileConfigService.getProfileList();
  }

  /**
   * Closes the underlying RemoteXPC connection. Safe to call more than once (errors are logged at debug level).
   */
  async close(): Promise<void> {
    try {
      this.log.debug(`Closing remoteXPC connection`);
      await this.remoteXPCConnection.close();
    } catch (err: any) {
      this.log.debug(`Error closing remoteXPC connection: ${err.message}`);
    }
  }
}
