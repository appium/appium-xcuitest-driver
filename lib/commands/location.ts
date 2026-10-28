import type {Simulator} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';
import {util} from 'appium/support.js';

import type {XCUITestDriver} from '../driver.js';
import {supportsApiLevel17} from '../utils/index.js';
import {AuthorizationStatus} from './enum.js';
import type {LocationWithAltitude, WDALocationInfo} from './types.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    getGeoLocation(...args: Parameters<typeof getGeoLocation>): ReturnType<typeof getGeoLocation>;
    setGeoLocation(...args: Parameters<typeof setGeoLocation>): ReturnType<typeof setGeoLocation>;
    mobileResetLocationService(
      ...args: Parameters<typeof mobileResetLocationService>
    ): ReturnType<typeof mobileResetLocationService>;
  }
}

const REAL_DEVICE_LOCATION_UNSUPPORTED_MESSAGE =
  'Simulating the location is only supported on real devices running iOS/tvOS 17 or newer';

/**
 * Returns the geographic location of the device under test.
 *
 * Location Services for WDA must be set to 'Always' for reliable readings from the device
 * (`/wda/device/location`). Latitude, longitude, and altitude may still be zero briefly after
 * enabling Always, while the device updates its fix.
 *
 * On iOS 17 and newer, if `mobile:setSimulatedLocation` was used earlier in the session, this
 * command may return that simulated position via `mobile:getSimulatedLocation` before falling
 * back to the device endpoint above.
 *
 * @returns Coordinates with altitude
 * @throws {Error} If WDA returns an error (for example, tvOS may report unsupported).
 */
export async function getGeoLocation(this: XCUITestDriver): Promise<LocationWithAltitude> {
  if (supportsApiLevel17(this.opts.platformVersion, this.opts.platformName)) {
    const {latitude, longitude} = await this.mobileGetSimulatedLocation();
    if (util.hasValue(latitude) && util.hasValue(longitude)) {
      this.log.debug(
        'Returning the geolocation that has been previously set by mobile:setSimulatedLocation. ' +
          'mobile:resetSimulatedLocation can reset the location configuration.',
      );
      return {latitude, longitude, altitude: 0};
    }

    this.log.warn(`No location was set by mobile:setSimulatedLocation. Trying to return the location from the device.`);
  }

  // Prefer `/wda/device/location` over `/wda/simulatedLocation` for reads: they can disagree
  // until a simulated location is applied; `/wda/simulatedLocation` may be null until then.
  const {authorizationStatus, latitude, longitude, altitude} = (await this.proxyCommand(
    '/wda/device/location',
    'GET',
  )) as WDALocationInfo;

  // `3` === kCLAuthorizationStatusAuthorizedAlways (CLAuthorizationStatus)
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
}

/**
 * Sets the geographic location of the device under test.
 *
 * On a simulator, coordinates are passed to the simulator API. On a real device running
 * iOS 17 or newer, this uses `mobile:setSimulatedLocation` (XCTest session simulated location).
 * Older real devices are not supported.
 *
 * @param location - Must include `latitude` and `longitude` (each coerced with `Number()`).
 * @throws {errors.NotImplementedError} When the target is a real device below iOS/tvOS 17.
 */
export async function setGeoLocation(
  this: XCUITestDriver,
  location: Partial<LocationWithAltitude>,
): Promise<LocationWithAltitude> {
  for (const name of ['latitude', 'longitude']) {
    if (!util.hasValue(location[name as keyof typeof location])) {
      throw new errors.InvalidArgumentError(`${name} should be set`);
    }
    if (!Number.isFinite(Number(location[name as keyof typeof location]))) {
      throw new errors.InvalidArgumentError(
        `${name} must be a number, got '${location[name as keyof typeof location]}' instead`,
      );
    }
  }
  const [latitudeNumber, longitudeNumber] = [Number(location.latitude), Number(location.longitude)];

  if (this.isSimulator()) {
    await (this.device as Simulator).setGeolocation(`${latitudeNumber}`, `${longitudeNumber}`);
    return {latitude: latitudeNumber, longitude: longitudeNumber, altitude: 0};
  }

  if (supportsApiLevel17(this.opts.platformVersion, this.opts.platformName)) {
    this.log.info(`Proxying to mobile:setSimulatedLocation method for iOS 17+`);
    await this.mobileSetSimulatedLocation(latitudeNumber, longitudeNumber);
  } else {
    throw new errors.NotImplementedError(REAL_DEVICE_LOCATION_UNSUPPORTED_MESSAGE);
  }

  return {latitude: latitudeNumber, longitude: longitudeNumber, altitude: 0};
}

/**
 * Resets the simulated location state.
 *
 * Supported on iOS 17 and newer (`mobile:resetSimulatedLocation`, simulator or real device).
 *
 * @throws {errors.NotImplementedError} When the target is a simulator or a real device on iOS < 17.
 */
export async function mobileResetLocationService(this: XCUITestDriver): Promise<void> {
  if (supportsApiLevel17(this.opts.platformVersion, this.opts.platformName)) {
    this.log.info(`Proxying to mobile:resetSimulatedLocation method for iOS 17+`);
    await this.mobileResetSimulatedLocation();
    return;
  }

  throw new errors.NotImplementedError(this.isSimulator() ? undefined : REAL_DEVICE_LOCATION_UNSUPPORTED_MESSAGE);
}
