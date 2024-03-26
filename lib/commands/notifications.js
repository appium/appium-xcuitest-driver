import {errors} from 'appium/driver';
import _ from 'lodash';

export default {
  /**
   * Simulates push notification delivery to a simulated device.
   *
   * **Only "remote" push notifications are supported.** VoIP, Complication, File Provider, and other types are unsupported.
   *
   * Supported in Xcode SDK 11.4+.
   * @param {string} bundleId - The bundle identifier of the target application
   * @param {import('./types').PushPayload} payload - Valid push payload.
   * @group Simulator Only
   * @this {XCUITestDriver}
   */
  async mobilePushNotification(bundleId, payload) {
    if (!this.isSimulator()) {
      throw new Error('This extension only works on Simulator');
    }

    if (!bundleId) {
      throw new errors.InvalidArgumentError(
        `'bundleId' argument must be a valid bundle identifier string`,
      );
    }
    if (!_.isPlainObject(payload)) {
      throw new errors.InvalidArgumentError(
        `The 'payload' argument value must be a valid dictionary. ` +
          `Got ${JSON.stringify(payload)} instead`,
      );
    }
    if (!_.isPlainObject(payload.aps)) {
      throw new errors.InvalidArgumentError(
        `The 'payload.aps' value must be a valid dictionary. ` +
          `Got ${JSON.stringify(payload.aps)} instead`,
      );
    }
    return await /** @type {import('../driver').Simulator} */ (this.device).pushNotification({
      ...payload,
      'Simulator Target Bundle': bundleId,
    });
  },

  /**
   * Blocks until the expected notification is delivered.
   *
   * This method is a thin wrapper over the
   * [`XCTNSNotificationExpectation`](https://developer.apple.com/documentation/xctest/xctnsnotificationexpectation?language=objc) and
   * [`XCTDarwinNotificationExpectation`](https://developer.apple.com/documentation/xctest/xctdarwinnotificationexpectation?language=objc) entities.
   *
   * @param {string} name - The name of the notification to expect
   * @param {import('./types').NotificationType} type - Which notification type to expect.
   * @param {number} timeoutSeconds - For how long to wait until the notification is delivered (in float seconds).
   * @throws A [`TimeoutError`](https://www.selenium.dev/selenium/docs/api/javascript/module/selenium-webdriver/lib/error_exports_TimeoutError.html) if the expected notification has not been delivered within the given timeout.
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
