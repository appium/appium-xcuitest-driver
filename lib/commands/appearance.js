import _ from 'lodash';


const commands = {};

/**
 * @typedef {Object} SetAppearanceOptions
 *
 * @property {string} style - Currently two styles are supported:
 * - dark
 * - light
 */

/**
 * Set the device's UI appearance style
 *
 * @since Xcode SDK 11.4
 * @param {SetAppearanceOptions} opts
 */
commands.mobileSetAppearance = async function mobileSetAppearance (opts = {}) {
  const {
    style,
  } = opts;
  if (!style) {
    throw new Error(`The 'style' option is expected to be present`);
  }

  return this.isSimulator()
    ? await this.opts.device.setAppearance(style)
    // ugly workaround for real devices
    : await this.siriCommand({text: `Turn ${_.toLower(style) === 'dark' ? 'on' : 'off'} dark mode`});
};

/**
 * @typedef {Object} SetPermissionsOptions
 *
 * @property {Object} access - One or more access rules to set.
 * The following keys are supported:
 * - all: Apply the action to all services.
 * - calendar: Allow access to calendar.
 * - contacts-limited: Allow access to basic contact info.
 * - contacts: Allow access to full contact details.
 * - location: Allow access to location services when app is in use.
 * - location-always: Allow access to location services at all times.
 * - photos-add: Allow adding photos to the photo library.
 * - photos: Allow full access to the photo library.
 * - media-library: Allow access to the media library.
 * - microphone: Allow access to audio input.
 * - motion: Allow access to motion and fitness data.
 * - reminders: Allow access to reminders.
 * - siri: Allow use of the app with Siri.
 * The following values are supported:
 * - yes: To grant the permission
 * - no: To revoke the permission
 * - unset: To reset the permission
 * @property {string} bundleId - The bundle identifier of the destination app.
 */

/**
 * Get the device's UI appearance style.
 *
 * @since Xcode SDK 11.4
 * @returns {string} The device's appearance value.
 * This could be one of:
 * - `light`
 * - `dark`
 * - `unknown`
 * - `unsupported`
 */
commands.mobileGetAppearance = async function mobileGetAppearance () {
  return this.isSimulator()
    ? await this.opts.device.getAppearance()
    : (await this.proxyCommand('/wda/device/info', 'GET')).userInterfaceStyle;
};


export { commands };
export default commands;
