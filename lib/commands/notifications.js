import { errors } from 'appium-base-driver';
import _ from 'lodash';

const extensions = {};

/**
 * @typedef {Object} PushNotification
 *
 * @property {!string} bundleId - The bundle identifier of the target application
 * @property {!object} payload - Remote notification payload. Read the `Create the JSON Payload` topic of
 * https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification
 * for more details on how to create this payload.
 */

/**
 * Simulates push notification delivery to Simulator.
 * Only application remote push notifications are supported. VoIP, Complication, File Provider,
 * and other types are not supported
 *
 * @since Xcode SDK 11.4
 * @param {PushNotification} opts - The object that describes Apple push notification content.
 * It must contain a top-level `bundleId` key with a string value matching
 * the target application‘s bundle identifier and "payload.aps" key with valid Apple Push Notification values.
 * Check the output of `xcrun simctl help push` command for more details.
 */
extensions.mobilePushNotification = async function mobilePushNotification (opts = {}) {
  if (!this.isSimulator()) {
    throw new Error('This extension only works on Simulator');
  }

  const { payload, bundleId } = opts;
  if (!bundleId) {
    throw new errors.InvalidArgumentError(`'bundleId' argument must be a valid bundle identifier string`);
  }
  if (!_.isPlainObject(payload)) {
    throw new errors.InvalidArgumentError(`The 'payload' argument value must be a valid dictionary. ` +
      `Got ${JSON.stringify(payload)} instead`);
  }
  if (!_.isPlainObject(payload.aps)) {
    throw new errors.InvalidArgumentError(`The 'payload.aps' value must be a valid dictionary. ` +
      `Got ${JSON.stringify(payload.aps)} instead`);
  }
  return await this.opts.device.pushNotification({
    ...payload,
    'Simulator Target Bundle': bundleId,
  });
};


/**
 * @typedef {Object} NotificationExpectationOptions
 *
 * @property {!string} name - The name of the notification to expect
 * @property {?string} type [plain] - Which notification type to expect.
 * Either 'plain' to wait for a notification from the default notification center or 'darwin'
 * to wait for a system notification.
 * @property {number} timeoutSeconds [60] - For how long to wait until the notification is delivered
 * in float seconds.
 */

/**
 * Blocks until the expected notification is delivered.
 * This method is a thin wrapper over XCTNSNotificationExpectation and
 * XCTDarwinNotificationExpectation entities.
 *
 * @param {NotificationExpectationOptions} opts
 * @throws TimeoutError if the expected notification has not been delivered within the given timeout
 */
extensions.mobileExpectNotification = async function mobileExpectNotification (opts = {}) {
  const { name, type, timeoutSeconds } = opts;
  return await this.proxyCommand('/wda/expectNotification', 'POST', {
    name,
    type,
    timeout: timeoutSeconds,
  });
};

export default extensions;
