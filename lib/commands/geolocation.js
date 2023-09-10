const commands = {};

/**
 * @typedef {Object} GeolocationInfo
 * @property {number|null} latitude Measurement of distance north or south of the Equator, or
 * `null` if {@linkcode XCUITestDriver.mobileSetSimulatedLocation} has not been called or {@linkcode
 * resetSimulatedLocation} has been called.
 * @property {number|null} longitude Measurement of distance east or west of the prime meridian, or
 * `null` if {@linkcode XCUITestDriver.mobileSetSimulatedLocation} has not been called or {@linkcode
 * resetSimulatedLocation} has been called.
 */

/**
 * Retrieves the simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4
 *
 * @returns {Promise<GeolocationInfo>}
 * @throws {Error} If the device under test does not support gelolocation simulation.
 * @since 4.18
 * @this {XCUITestDriver}
 */
commands.mobileGetSimulatedLocation = async function mobileGetSimulatedLocation() {
  return await this.proxyCommand('/wda/simulatedLocation', 'GET');
};

/**
 * Sets simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<void>}
 * @throws {Error} If the device under test does not support gelolocation simulation.
 * @since 4.18
 * @this {XCUITestDriver}
 */
commands.mobileSetSimulatedLocation = async function mobileSetSimulatedLocation(
  latitude,
  longitude,
) {
  return await this.proxyCommand('/wda/simulatedLocation', 'POST', {latitude, longitude});
};

/**
 * Resets simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4.
 * ! Do not forget to reset the simulated geolocation value after your automated test is finished.
 * ! If the value is not reset explcitly then the simulated one will remain until the next device restart.
 *
 * @returns {Promise<void>}
 * @throws {Error} If the device under test does not support gelolocation simulation.
 * @since 4.18
 * @this {XCUITestDriver}
 */
commands.mobileResetSimulatedLocation = async function mobileResetSimulatedLocation() {
  return await this.proxyCommand('/wda/simulatedLocation', 'DELETE');
};

export {commands};
export default commands;

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
