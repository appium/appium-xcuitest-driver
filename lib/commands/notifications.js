import { errors } from 'appium-base-driver';
import _ from 'lodash';

const extensions = {};

/**
 * @typedef {Object} APS
 *
 * @property {!string} alert The actual alert text
 * @property {?number} badge The notification badge index
 * @property {?string} sound The name of the sound to play when
 * the notification is received
 */

/**
 * @typedef {Object} PushNotification
 *
 * @property {!string} bundleId - The bundle identifier of the target application
 * @property {!APS} aps
 */

/**
 * Simulates push notification delivery to Simulator.
 * Only application remote push notifications are supported. VoIP, Complication, File Provider,
 * and other types are not supported
 *
 * @since Xcode SDK 11.4
 * @param {PushNotification} opts - The object that describes Apple push notification content.
 * It must contain a top-level `bundleId` key with a string value matching
 * the target application‘s bundle identifier and "aps" key with valid Apple Push Notification values.
 * For example:
 * {
 *   "bundleId": "com.apple.Preferences",
 *   "aps": {
 *     "alert": "This is a simulated notification!",
 *     "badge": 3,
 *     "sound": "default"
 *   }
 * }
 * Check the output of `xcrun simctl help push` command for more details.
 */
extensions.mobilePushNotification = async function mobilePushNotification (opts = {}) {
  const { bundleId, aps } = opts;
  if (!this.isSimulator()) {
    throw new Error('This extension only works on Simulator');
  }
  if (!bundleId) {
    throw new errors.InvalidArgumentError(`'bundleId' argument must be a valid bundle identifier string`);
  }
  if (!_.isPlainObject(aps)) {
    throw new errors.InvalidArgumentError(`The 'aps' argument value must be a valid dictionary, ` +
      `got ${JSON.stringify(aps)} instead`);
  }
  return await this.opts.device.pushNotification({
    'Simulator Target Bundle': bundleId,
    aps,
  });
};

export default extensions;
