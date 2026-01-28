import type {AppiumLogger} from '@appium/types';
import {getRemoteXPCServices} from './remotexpc-utils';
import type {
  NotificationProxyService as RemoteXPCNotificationProxyService,
  RemoteXpcConnection,
} from 'appium-ios-remotexpc';
import {services} from 'appium-ios-device';
import type {NotificationProxy as IOSDeviceNotificationProxy} from 'appium-ios-device';

/**
 * Unified Notification Proxy Client
 *
 * Provides a unified interface for notification proxy operations on iOS devices,
 * automatically handling the differences between iOS < 18 (appium-ios-device)
 * and iOS 18 and above (appium-ios-remotexpc NotificationProxyService).
 */
export class NotificationClient {
  private readonly service: RemoteXPCNotificationProxyService | IOSDeviceNotificationProxy;
  private readonly remoteXPCConnection?: RemoteXpcConnection;
  private readonly log: AppiumLogger;

  private constructor(
    service: RemoteXPCNotificationProxyService | IOSDeviceNotificationProxy,
    log: AppiumLogger,
    remoteXPCConnection?: RemoteXpcConnection,
  ) {
    this.service = service;
    this.log = log;
    this.remoteXPCConnection = remoteXPCConnection;
  }

  //#region Public Methods

  /**
   * Create a notification client for device
   *
   * @param udid - Device UDID
   * @param log - Appium logger instance
   * @param useRemoteXPC - Whether to use remotexpc (use isIos18OrNewer(opts) to determine)
   * @returns NotificationClient instance
   */
  static async create(
    udid: string,
    log: AppiumLogger,
    useRemoteXPC: boolean,
  ): Promise<NotificationClient> {
    if (useRemoteXPC) {
      const client = await NotificationClient.withRemoteXpcConnection(async () => {
        const Services = await getRemoteXPCServices();
        const {notificationProxyService, remoteXPC} =
          await Services.startNotificationProxyService(udid);
        return {
          service: notificationProxyService,
          connection: remoteXPC,
        };
      }, log);
      if (client) {
        return client;
      }
    }

    // Fallback to appium-ios-device
    const notificationProxy = await services.startNotificationProxyService(udid);
    return new NotificationClient(notificationProxy, log);
  }

  /**
   * Observe a specific notification and wait for it
   *
   * @param notificationName - Name of the notification to observe
   * @returns Promise that resolves when the notification is received
   */
  async observeNotification(notificationName: string): Promise<void> {
    if (this.isRemoteXPC) {
      await this.remoteXPCNotificationProxy.observe(notificationName);
    } else {
      // iOS Device: Use callback-based observation wrapped in a promise
      return new Promise((resolve) => {
        this.iosDeviceNotificationProxy.observeNotification(notificationName, {
          notification: resolve,
        });
      });
    }
  }

  /**
   * Close the notification service connection and remoteXPC connection if present
   */
  async close(): Promise<void> {
    // Close the service first
    if (this.service && typeof (this.service as any).close === 'function') {
      (this.service as any).close();
    }

    // Then close RemoteXPC connection if present
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
   * @returns NotificationClient on success, null on failure
   */
  private static async withRemoteXpcConnection<
    T extends RemoteXPCNotificationProxyService | IOSDeviceNotificationProxy,
  >(
    operation: () => Promise<{service: T; connection: RemoteXpcConnection}>,
    log: AppiumLogger,
  ): Promise<NotificationClient | null> {
    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const {service, connection} = await operation();
      remoteXPCConnection = connection;
      const client = new NotificationClient(service, log, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      log.error(
        `Failed to create notification client via RemoteXPC: ${err.message}, falling back to appium-ios-device`,
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
   * Get service as RemoteXPC NotificationProxyService
   */
  private get remoteXPCNotificationProxy(): RemoteXPCNotificationProxyService {
    return this.service as RemoteXPCNotificationProxyService;
  }

  /**
   * Get service as iOS Device NotificationProxy
   */
  private get iosDeviceNotificationProxy(): IOSDeviceNotificationProxy {
    return this.service as IOSDeviceNotificationProxy;
  }

  //#endregion
}
