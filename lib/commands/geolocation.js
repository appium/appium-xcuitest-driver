import { requireArgs } from '../utils';

const commands = {};

/**
 * @typedef {Object} GeolocationInfo
 * @property {number} latitude Measurement of distance north or south of the Equator.
 * @property {number} longitude Measurement of distance east or west of the prime meridian.
 */

/**
 * Retrieves simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4
 *
 * @returns {GeolocationInfo} All entry values are set to null if no simulated location has
 * been set prior to calling this API.
 * @throws {Error} If the device under test does not support gelolocation simulation.
 */
commands.mobileGetSimulatedLocation = async function mobileGetSimulatedLocation () {
  return await this.proxyCommand('/wda/simulatedLocation', 'GET');
};

/**
 * Sets simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4
 *
 * @param {GeolocationInfo} opts
 * @throws {Error} If the device under test does not support gelolocation simulation.
 */
commands.mobileSetSimulatedLocation = async function mobileGetSimulatedLocation (opts = {}) {
  const {latitude, longitude} = requireArgs(['latitude', 'longitude'], opts);
  return await this.proxyCommand('/wda/simulatedLocation', 'POST', {latitude, longitude});
};

/**
 * Resets simulated geolocation value.
 * Only works since Xcode 14.3/iOS 16.4.
 * ! Do not forget to reset the simulated geolocation value after your automated test is finished.
 * ! If the value is not reset explcitly then the simulated one will remain until the next device restart.
 *
 * @throws {Error} If the device under test does not support gelolocation simulation.
 */
commands.mobileResetSimulatedLocation = async function mobileGetSimulatedLocation () {
  return await this.proxyCommand('/wda/simulatedLocation', 'DELETE');
};

export { commands };
export default commands;
