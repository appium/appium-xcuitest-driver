import { services } from 'appium-ios-device';
import { util } from 'appium-support';
import log from '../logger';

let commands = {};

commands.getGeoLocation = async function getGeoLocation () {
  const {
    authorizationStatus,
    latitude,
    longitude
  } = await this.proxyCommand('/wda/device/location', 'GET');

  // '3' is 'Always' in the privacy
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
