import type {AppiumLogger} from '@appium/types';
import {Pyidevice} from './clients/py-ios-device-client';
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
 * Unified Certificate Client
 *
 * Provides a unified interface for certificate operations on iOS devices,
 * automatically handling the differences between iOS < 18 (py-ios-device)
 * and iOS 18 and above (appium-ios-remotexpc MobileConfigService).
 */
export class CertificateClient {
  private readonly service: RemoteXPCMobileConfigService | Pyidevice;
  private readonly remoteXPCConnection?: RemoteXpcConnection;
  private readonly log: AppiumLogger;

  private constructor(
    service: RemoteXPCMobileConfigService | Pyidevice,
    log: AppiumLogger,
    remoteXPCConnection?: RemoteXpcConnection,
  ) {
    this.service = service;
    this.log = log;
    this.remoteXPCConnection = remoteXPCConnection;
  }

  //#region Public Methods

  /**
   * Create a certificate client for device
   *
   * @param udid - Device UDID
   * @param log - Appium logger instance
   * @param useRemoteXPC - Whether to use remotexpc (use isIos18OrNewer(opts) to determine)
   * @returns Certificate client instance
   */
  static async create(
    udid: string,
    log: AppiumLogger,
    useRemoteXPC: boolean,
  ): Promise<CertificateClient> {
    if (useRemoteXPC) {
      const client = await CertificateClient.withRemoteXpcConnection(async () => {
        const Services = await getRemoteXPCServices();
        const {mobileConfigService, remoteXPC} = await Services.startMobileConfigService(udid);
        return {
          service: mobileConfigService,
          connection: remoteXPC,
        };
      }, log);
      if (client) {
        return client;
      }
    }

    // Fallback to py-ios-device
    const pyideviceClient = new Pyidevice({
      udid,
      log,
    });
    await pyideviceClient.assertExists(true);
    return new CertificateClient(pyideviceClient, log);
  }

  /**
   * Install a certificate profile
   *
   * @param options - Installation options containing the certificate payload
   */
  async installCertificate(options: InstallCertificateOptions): Promise<void> {
    const {payload} = options;

    if (this.isRemoteXPC) {
      await this.mobileConfigService.installProfileFromBuffer(payload);
    } else {
      await this.pyideviceClient.installProfile({payload});
    }
  }

  /**
   * Remove a certificate profile by name
   *
   * @param name - Name of the profile to remove
   * @returns Status message ('Acknowledged' for RemoteXPC, or pyidevice output)
   */
  async removeCertificate(name: string): Promise<string> {
    if (this.isRemoteXPC) {
      await this.mobileConfigService.removeProfile(name);
      return 'Acknowledged';
    } else {
      return await this.pyideviceClient.removeProfile(name);
    }
  }

  /**
   * List installed certificate profiles
   *
   * @returns List of installed certificates
   */
  async listCertificates(): Promise<CertificateList> {
    if (this.isRemoteXPC) {
      return await this.mobileConfigService.getProfileList();
    } else {
      return await this.pyideviceClient.listProfiles();
    }
  }

  /**
   * Close the certificate service connection and remoteXPC connection if present
   */
  async close(): Promise<void> {
    if (this.remoteXPCConnection) {
      try {
        this.log.debug(`Closing remoteXPC connection`);
        await this.remoteXPCConnection.close();
      } catch (err: any) {
        this.log.debug(`Error closing remoteXPC connection: ${err.message}`);
      }
    }
  }

  //#endregion

  //#region Private Methods

  /**
   * Check if this client is using RemoteXPC
   */
  private get isRemoteXPC(): boolean {
    return !!this.remoteXPCConnection;
  }

  /**
   * Helper to safely execute remoteXPC operations with connection cleanup
   * @param operation - Async operation that returns service and connection
   * @param log - Logger instance
   * @returns CertificateClient on success, null on failure
   */
  private static async withRemoteXpcConnection<T extends RemoteXPCMobileConfigService | Pyidevice>(
    operation: () => Promise<{service: T; connection: RemoteXpcConnection}>,
    log: AppiumLogger,
  ): Promise<CertificateClient | null> {
    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const {service, connection} = await operation();
      remoteXPCConnection = connection;
      const client = new CertificateClient(service, log, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      log.error(
        `Failed to create certificate client via RemoteXPC: ${err.message}, falling back to py-ios-device`,
      );
      return null;
    } finally {
      // Only close connection if we failed (if succeeded, the client owns it)
      if (remoteXPCConnection && !succeeded) {
        try {
          await remoteXPCConnection.close();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Get service as RemoteXPC MobileConfigService
   */
  private get mobileConfigService(): RemoteXPCMobileConfigService {
    return this.service as RemoteXPCMobileConfigService;
  }

  /**
   * Get service as Pyidevice client
   */
  private get pyideviceClient(): Pyidevice {
    return this.service as Pyidevice;
  }

  //#endregion
}
