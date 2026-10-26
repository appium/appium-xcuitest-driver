import type {AppiumLogger} from '@appium/types';
import type {MobileConfigService as RemoteXPCMobileConfigService} from 'appium-ios-remotexpc';

import type {CertificateList} from '../commands/types.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Options for installing a certificate
 */
export interface InstallCertificateOptions {
  payload: Buffer;
}

/**
 * Certificate (MDM profile) operations on real devices using RemoteXPC.
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
   * @param facade - RemoteXPC facade of the session
   * @throws {Error} If the mobile config service cannot be started
   */
  static async create(udid: string, log: AppiumLogger, facade: RemoteXPCFacade): Promise<CertificateClient> {
    const mobileConfigService = await facade.requireService('mobile config', (Services, options) =>
      Services.startMobileConfigService(udid, options),
    );
    return new CertificateClient(mobileConfigService, log);
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
