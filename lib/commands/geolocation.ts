import type {XCUITestDriver} from '../driver';

export interface GeolocationInfo {
  /** Measurement of distance north or south of the Equator, or `null` if {@linkcode XCUITestDriver.mobileSetSimulatedLocation} has not been called or {@linkcode mobileResetSimulatedLocation} has been called. */
  latitude: number | null;
  /** Measurement of distance east or west of the prime meridian, or `null` if {@linkcode XCUITestDriver.mobileSetSimulatedLocation} has not been called or {@linkcode mobileResetSimulatedLocation} has been called. */
  longitude: number | null;
}

/**
 * Retrieves the simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4
 *
 * @returns The current simulated geolocation
 * @throws If the device under test does not support geolocation simulation.
 * @since 4.18
 */
export async function mobileGetSimulatedLocation(this: XCUITestDriver): Promise<GeolocationInfo> {
  return await this.proxyCommand<any, GeolocationInfo>('/wda/simulatedLocation', 'GET');
}

/**
 * Sets simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4
 *
 * @param latitude - Latitude value
 * @param longitude - Longitude value
 * @throws If the device under test does not support geolocation simulation.
 * @since 4.18
 */
export async function mobileSetSimulatedLocation(
  this: XCUITestDriver,
  latitude: number,
  longitude: number,
): Promise<void> {
  await this.proxyCommand('/wda/simulatedLocation', 'POST', {latitude, longitude});
}

/**
 * Resets simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4.
 * ! Do not forget to reset the simulated geolocation value after your automated test is finished.
 * ! If the value is not reset explicitly then the simulated one will remain until the next device restart.
 *
 * @throws If the device under test does not support geolocation simulation.
 * @since 4.18
 */
export async function mobileResetSimulatedLocation(this: XCUITestDriver): Promise<void> {
  await this.proxyCommand('/wda/simulatedLocation', 'DELETE');
}
