import type {AppiumLogger} from '@appium/types';
import {getRemoteXPCServices} from './remotexpc-utils';
import type {NotificationProxyService as RemoteXPCNotificationProxyService} from 'appium-ios-remotexpc';
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
  private readonly _isRemoteXPC: boolean;
  private readonly log: AppiumLogger;

  private constructor(
    service: RemoteXPCNotificationProxyService | IOSDeviceNotificationProxy,
    log: AppiumLogger,
    isRemoteXPC: boolean,
  ) {
    this.service = service;
    this.log = log;
    this._isRemoteXPC = isRemoteXPC;
  }

  /**
   * Check if this client is using RemoteXPC
   */
  private get isRemoteXPC(): boolean {
    return this._isRemoteXPC;
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
      try {
        const Services = await getRemoteXPCServices();
        const notificationProxyService = await Services.startNotificationProxyService(udid);
        return new NotificationClient(notificationProxyService, log, true);
      } catch (err: any) {
        log.error(
          `Failed to create notification client via RemoteXPC: ${err.message}, falling back to appium-ios-device`,
        );
      }
    }

    // Fallback to appium-ios-device
    const notificationProxy = await services.startNotificationProxyService(udid);
    return new NotificationClient(notificationProxy, log, false);
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
   * Close the notification service connection
   */
  async close(): Promise<void> {
    this.service.close();
  }
}
