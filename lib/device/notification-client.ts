import type {AppiumLogger} from '@appium/types';
import type {NotificationProxyService as RemoteXPCNotificationProxyService} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from './remote-xpc/index.js';

interface CreateNotificationClientOptions {
  facade: RemoteXPCFacade;
  logger: AppiumLogger;
}

/**
 * Notification Proxy Client
 *
 * Provides notification proxy operations on iOS devices on top of appium-ios-remotexpc.
 */
export class NotificationClient {
  private constructor(
    private readonly service: RemoteXPCNotificationProxyService,
    private readonly log: AppiumLogger,
  ) {}

  /**
   * Create a notification client for device
   *
   * @param udid - Device UDID
   * @param opts - Creation options
   * @returns NotificationClient instance
   */
  static async create(udid: string, opts: CreateNotificationClientOptions): Promise<NotificationClient> {
    const {facade, logger} = opts;
    const service = await facade.requireService('notification proxy', (Services, options) =>
      Services.startNotificationProxyService(udid, options),
    );
    return new NotificationClient(service, logger);
  }

  /**
   * Subscribe to a specific notification. Resolves once the subscription is in place,
   * so that an action triggered afterwards cannot be missed.
   *
   * @param notificationName - Name of the notification to observe
   */
  async observe(notificationName: string): Promise<void> {
    await this.service.observe(notificationName);
  }

  /**
   * Wait for a notification of an already observed name
   *
   * @param timeoutMs - How long to wait for the notification
   * @throws If nothing is received within the timeout
   */
  async expectNotification(timeoutMs?: number): Promise<void> {
    await this.service.expectNotification(timeoutMs);
  }

  /**
   * Close the notification service connection
   */
  async close(): Promise<void> {
    this.service.close();
  }
}
