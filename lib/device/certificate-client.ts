import type {AppiumLogger} from '@appium/types';
import {getRemoteXPCServices} from './remotexpc-utils';
import type {CertificateList} from '../commands/types';
import type {MobileConfigService as RemoteXPCMobileConfigService} from 'appium-ios-remotexpc';

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
  private readonly log: AppiumLogger;

  private constructor(mobileConfigService: RemoteXPCMobileConfigService, log: AppiumLogger) {
    this.mobileConfigService = mobileConfigService;
    this.log = log;
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
          'appium-ios-remotexpc package installed.',
      );
    }

    try {
      const Services = await getRemoteXPCServices();
      const mobileConfigService = await Services.startMobileConfigService(udid);
      return new CertificateClient(mobileConfigService, log);
    } catch (err: any) {
      throw new Error(
        `Failed to start RemoteXPC mobile config service for certificate operations: ${err.message}. ` +
          'Ensure appium-ios-remotexpc is installed and the device is supported.',
        {cause: err},
      );
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
   * No-op: discovery RSD is closed by remotexpc before the service is returned.
   */
  async close(): Promise<void> {}
}
