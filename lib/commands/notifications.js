import {errors} from 'appium/driver';
import _ from 'lodash';

export default {
  /**
   * Simulates push notification delivery to Simulator.
   *
   * **Only application remote push notifications are supported.** VoIP, Complication, File Provider, and other types are unsupported.
   *
   * @since Xcode SDK 11.4
   * @param {string} bundleId - the target application‘s bundle identifier
   * @param {PushPayload} payload - The push payload
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobilePushNotification(bundleId, payload) {
    if (!this.isSimulator()) {
      throw new Error('This extension only works on Simulator');
    }

    if (!bundleId) {
      throw new errors.InvalidArgumentError(
        `'bundleId' argument must be a valid bundle identifier string`
      );
    }
    if (!_.isPlainObject(payload)) {
      throw new errors.InvalidArgumentError(
        `The 'payload' argument value must be a valid dictionary. ` +
          `Got ${JSON.stringify(payload)} instead`
      );
    }
    if (!_.isPlainObject(payload.aps)) {
      throw new errors.InvalidArgumentError(
        `The 'payload.aps' value must be a valid dictionary. ` +
          `Got ${JSON.stringify(payload.aps)} instead`
      );
    }
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.pushNotification({
      ...payload,
      'Simulator Target Bundle': bundleId,
    });
  },

  /**
   * Blocks until the expected notification is delivered.
   *
   * This method is a thin wrapper over `XCTNSNotificationExpectation` and
   * `XCTDarwinNotificationExpectation` entities.
   *
   * @param {string} name - The name of the notification to expect
   * @param {NotificationType} type - Which notification type to expect.
   * @param {number} timeoutSeconds - For how long to wait until the notification is delivered (in float seconds).
   * @throws `TimeoutError` if the expected notification has not been delivered within the given timeout
   * @this {XCUITestDriver}
   */
  async mobileExpectNotification(name, type = 'plain', timeoutSeconds = 60) {
    return await this.proxyCommand('/wda/expectNotification', 'POST', {
      name,
      type,
      timeout: timeoutSeconds,
    });
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * Either `plain` to wait for a notification from the default notification center or `darwin` to wait for a system notification.
 * @typedef {'plain'|'darwin'} NotificationType
 */

/**
 * Payload for {@linkcode XCUITestDriver.mobilePushNotification}.
 *
 * Check the output of `xcrun simctl help push` command for more details.
 * @typedef PushPayload
 * @property {object} aps - The aps dictionary. Read the [Setting up a Remote Notification Server documentation](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification#2943359) under "Create a JSON Payload" for more details.
 * @privateRemarks The keys of `aps` [are documented](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification#2943360) and we should add them.
 */
