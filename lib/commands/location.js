import { services } from 'appium-ios-device';
import { util } from 'appium-support';
import log from '../logger';

let commands = {};

/**
 * @typedef {Object} LocationObject
 *
 * @property {number} latitude - The latitude of the device under test
 * @property {number} longitude - The lognitude of the device under test
 * @property {number} altitude - Always 0 since iOS does not return altitude as the Location Service
 */

/**
 * Returns location of the device under test.
 * The device under test must allow the location services for WDA
 * as 'Always' to get the location data correctly.
 *
 * The 'latitude' and 'longitude' could be zero even the location services
 * is 'Always' since it needs a time to uptodate the location data.
 *
 * @returns {LocationObject}
 * @throws {Error} If the device under test returns an error message.
 *                 i.e.: tvOS returns unsupported error
 */
commands.getGeoLocation = async function getGeoLocation () {
  const {
    authorizationStatus,
    latitude,
    longitude
  } = await this.proxyCommand('/wda/device/location', 'GET');

  // '3' is 'Always' in the privacy
  // https://developer.apple.com/documentation/corelocation/clauthorizationstatus
  if (authorizationStatus !== 3) {
    log.errorAndThrow(`Location service must be 'Always'. Please set it up manually via ` +
      `'Settings > Privacy > Location Services -> WebDriverAgentRunner-Runner'`);
  }

  return {latitude, longitude, altitude: 0};
};

commands.setGeoLocation = async function setGeoLocation (location) {
  let {latitude, longitude} = location;

  if (!util.hasValue(latitude) || !util.hasValue(longitude)) {
    log.errorAndThrow(`Both latitude and longitude should be set`);
  }

  if (this.isSimulator()) {
    await this.opts.device.setGeolocation(`${latitude}`, `${longitude}`);
    return;
  }

  const service = await services.startSimulateLocationService(this.opts.udid);
  try {
    service.setLocation(latitude, longitude);
  } catch (e) {
    log.errorAndThrow(`Can't set the location on device '${this.opts.udid}'. Original error: ${e.message}`);
  } finally {
    service.close();
  }
};

export { commands };
export default commands;
