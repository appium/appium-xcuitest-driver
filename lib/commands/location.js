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
   * For iOS 17, the return value could be the result of
   * "mobile:getSimulatedLocation" if the simulated location has been previously set
   * "mobile:setSimulatedLocation" already.
   *
   * @returns {Promise<import('./types').LocationWithAltitude>}
   * @throws {Error} If the device under test returns an error message.
   *                 i.e.: tvOS returns unsupported error
   * @this {XCUITestDriver}
   */
  async getGeoLocation() {
    // Currently we proxy the setGeoLocation to mobile:setSimulatedLocation for iOS 17+.
    // It would be helpful to address to use "mobile:getSimulatedLocation" for iOS 17+.
    if (this.opts.platformVersion && util.compareVersions(this.opts.platformVersion, '>=', '17.0')) {
      const {latitude, longitude} = await this.mobileGetSimulatedLocation();
      if (latitude && longitude) {
        this.log.debug('Returning the geolocation that has been previously set by mobile:setSimulatedLocation. ' +
          'mobile:resetSimulatedLocation can reset the location configuration.');
        return {latitude, longitude, altitude: 0};
      }

      this.log.warn(`No location was set by mobile:setSimulatedLocation. Trying to return the location from the device.`);
    }

    // Please do not change the way to get the location here with '/wda/simulatedLocation'
    // endpoint because they could return different value before setting the simulated location.
    // '/wda/device/location' returns current device location information,
    // but '/wda/simulatedLocation' returns `null` values until the WDA process
    // sets a simulated location. After setting the value, both returns the same values.
    const {authorizationStatus, latitude, longitude, altitude} = /** @type {WDALocationInfo} */ (
      await this.proxyCommand('/wda/device/location', 'GET')
    );

    // '3' is 'Always' in the privacy
    // https://developer.apple.com/documentation/corelocation/clauthorizationstatus
    if (authorizationStatus !== AuthorizationStatus.authorizedAlways) {
      throw this.log.errorWithException(
        `Location service must be set to 'Always' in order to ` +
          `retrieve the current geolocation data. Please set it up manually via ` +
          `'Settings > Privacy > Location Services -> WebDriverAgentRunner-Runner'. ` +
          `Or please use 'mobile:getSimulatedLocation'/'mobile:setSimulatedLocation' commands ` +
          `to simulate locations instead.`,
      );
    }

    return {latitude, longitude, altitude};
  },

  /**
   * Set location of the device under test.
   *
   * iOS 17+ real device environment will be via "mobile:setSimulatedLocation" as
   * setting simulated location for XCTest session.
   *
   * @param {Partial<Location>} location
   * @this {XCUITestDriver}
   */
  async setGeoLocation(location) {
    let {latitude, longitude} = location;

    if (!util.hasValue(latitude) || !util.hasValue(longitude)) {
      throw new errors.InvalidArgumentError(`Both latitude and longitude should be set`);
    }

    if (this.isSimulator()) {
      await /** @type {import('../driver').Simulator} */ (this.device).setGeolocation(`${latitude}`, `${longitude}`);
      return /** @type {Location} */ ({latitude, longitude, altitude: 0});
    }

    if (this.opts.platformVersion && util.compareVersions(this.opts.platformVersion, '>=', '17.0')) {
      this.log.info(`Proxying to mobile:setSimulatedLocation method for iOS 17+ platform version`);
      await this.mobileSetSimulatedLocation(latitude, longitude);
    } else {
      const service = await services.startSimulateLocationService(this.opts.udid);
      try {
        service.setLocation(latitude, longitude);
      } catch (e) {
        throw this.log.errorWithException(
          `Can't set the location on device '${this.opts.udid}'. Original error: ${e.message}`,
        );
      } finally {
        service.close();
      }
    }

    return /** @type {Location} */ ({latitude, longitude, altitude: 0});
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
      throw this.log.errorWithException(
        `Failed to reset the location on the device on device '${this.opts.udid}'. ` +
          `Origianl error: ${err.message}`,
      );
    } finally {
      service.close();
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').WDALocationInfo} WDALocationInfo
 * @typedef {import('@appium/types').Location} Location
 */
