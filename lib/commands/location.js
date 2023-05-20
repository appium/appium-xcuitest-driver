import {services} from 'appium-ios-device';
import {errors} from 'appium/driver';
import {util} from 'appium/support';
import {AuthorizationStatus} from './enum';

export default {
  /**
   * Returns location of the device under test.
   * The device under test must allow the location services for WDA
   * as 'Always' to get the location data correctly.
   *
   * The 'latitude', 'longitude' and 'altitude' could be zero even
   * if the Location Services are set to 'Always', because the device
   * needs some time to update the location data.
   *
   * @returns {Promise<import('./types').LocationWithAltitude>}
   * @throws {Error} If the device under test returns an error message.
   *                 i.e.: tvOS returns unsupported error
   * @this {XCUITestDriver}
   */
  async getGeoLocation() {
    const {authorizationStatus, latitude, longitude, altitude} = /** @type {WDALocationInfo} */ (
      await this.proxyCommand('/wda/device/location', 'GET')
    );

    // '3' is 'Always' in the privacy
    // https://developer.apple.com/documentation/corelocation/clauthorizationstatus
    if (authorizationStatus !== AuthorizationStatus.authorizedAlways) {
      this.log.errorAndThrow(
        `Location service must be set to 'Always' in order to ` +
          `retrive the current geolocation data. Please set it up manually via ` +
          `'Settings > Privacy > Location Services -> WebDriverAgentRunner-Runner'`
      );
    }

    return {latitude, longitude, altitude};
  },
  /**
   * @param {Partial<import('@appium/types').Location>} location
   * @this {XCUITestDriver}
   */
  async setGeoLocation(location) {
    let {latitude, longitude} = location;

    if (!util.hasValue(latitude) || !util.hasValue(longitude)) {
      throw new errors.InvalidArgumentError(`Both latitude and longitude should be set`);
    }

    if (this.isSimulator()) {
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      await this.opts.device.setGeolocation(`${latitude}`, `${longitude}`);
      return;
    }

    const service = await services.startSimulateLocationService(this.opts.udid);
    try {
      service.setLocation(latitude, longitude);
    } catch (e) {
      this.log.errorAndThrow(
        `Can't set the location on device '${this.opts.udid}'. Original error: ${e.message}`
      );
    } finally {
      service.close();
    }
  },

  /**
   * Reset the location service on real device.
   * Raises not implemented error for simulator.
   * @throws {Error} If the device is simulator, or 'resetLocation' raises an error.
   * @this {XCUITestDriver}
   */
  async mobileResetLocationService() {
    if (this.isSimulator()) {
      throw new errors.NotImplementedError();
    }

    const service = await services.startSimulateLocationService(this.opts.udid);
    try {
      service.resetLocation();
    } catch (err) {
      this.log.errorAndThrow(
        `Failed to reset the location on the device on device '${this.opts.udid}'. ` +
          `Origianl error: ${err.message}`
      );
    } finally {
      service.close();
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').WDALocationInfo} WDALocationInfo
 */
