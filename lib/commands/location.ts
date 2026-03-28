import {errors} from 'appium/driver';
import {
  SimulateLocationClient,
  type SimulateLocationSession,
} from '../device/simulate-location-client';
import {util} from 'appium/support';
import {AuthorizationStatus} from './enum';
import {isIos17OrNewer} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {Location} from '@appium/types';
import type {LocationWithAltitude, WDALocationInfo} from './types';
import type {Simulator} from 'appium-ios-simulator';

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
  if (isIos17OrNewer(this.opts)) {
    const {latitude, longitude} = await this.mobileGetSimulatedLocation();
    if (util.hasValue(latitude) && util.hasValue(longitude)) {
      this.log.debug(
        'Returning the geolocation that has been previously set by mobile:setSimulatedLocation. ' +
          'mobile:resetSimulatedLocation can reset the location configuration.',
      );
      return {latitude, longitude, altitude: 0};
    }

    this.log.warn(
      `No location was set by mobile:setSimulatedLocation. Trying to return the location from the device.`,
    );
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
 * On older real devices, it uses the legacy lockdown simulate-location service.
 *
 * @param location - Must include `latitude` and `longitude` (each coerced with `Number()`).
 */
export async function setGeoLocation(
  this: XCUITestDriver,
  location: Partial<Location>,
): Promise<Location> {
  for (const name of ['latitude', 'longitude']) {
    if (!util.hasValue(location[name as keyof typeof location])) {
      throw new errors.InvalidArgumentError(`${name} should be set`);
    }
  }
  const [latitudeNumber, longitudeNumber] = [Number(location.latitude), Number(location.longitude)];

  if (this.isSimulator()) {
    await (this.device as Simulator).setGeolocation(`${latitudeNumber}`, `${longitudeNumber}`);
    return {latitude: latitudeNumber, longitude: longitudeNumber, altitude: 0};
  }

  if (isIos17OrNewer(this.opts)) {
    this.log.info(`Proxying to mobile:setSimulatedLocation method for iOS 17+`);
    await this.mobileSetSimulatedLocation(latitudeNumber, longitudeNumber);
  } else {
    await withLegacySimulateLocationSession(
      this,
      'Device UDID is required to set geolocation on a real device',
      (session) => session.setLocation(latitudeNumber, longitudeNumber),
      (udid, msg) => `Can't set the location on device '${udid}'. Original error: ${msg}`,
    );
  }

  return {latitude: latitudeNumber, longitude: longitudeNumber, altitude: 0};
}

/**
 * Resets simulated or legacy location state.
 *
 * - iOS 17 and newer: `mobile:resetSimulatedLocation` (simulator or real device).
 * - Real device, older iOS: legacy simulate-location session over lockdown (UDID required).
 * - Simulator, older iOS: not supported.
 *
 * @throws {errors.NotImplementedError} When the target is a simulator on iOS &lt; 17.
 * @throws {errors.InvalidArgumentError} When the legacy path runs without a UDID.
 * @throws {Error} When the underlying reset fails.
 */
export async function mobileResetLocationService(this: XCUITestDriver): Promise<void> {
  if (isIos17OrNewer(this.opts)) {
    this.log.info(`Proxying to mobile:resetSimulatedLocation method for iOS 17+`);
    await this.mobileResetSimulatedLocation();
    return;
  }

  if (this.isSimulator()) {
    throw new errors.NotImplementedError();
  }

  await withLegacySimulateLocationSession(
    this,
    'Device UDID is required to reset location on a real device',
    (session) => session.resetLocation(),
    (udid, msg) => `Failed to reset location on device '${udid}'. Original error: ${msg}`,
  );
}

/**
 * Opens a legacy simulate-location session, runs `run`, closes the session, and maps errors.
 */
async function withLegacySimulateLocationSession(
  driver: XCUITestDriver,
  udidRequiredMessage: string,
  run: (session: SimulateLocationSession) => void | Promise<void>,
  formatError: (udid: string, originalMessage: string) => string,
): Promise<void> {
  const {udid} = driver.opts;
  if (!udid) {
    throw new errors.InvalidArgumentError(udidRequiredMessage);
  }
  const session = await SimulateLocationClient.startSession(udid);
  try {
    await run(session);
  } catch (e: any) {
    throw driver.log.errorWithException(formatError(udid, e.message));
  } finally {
    session.close();
  }
}
