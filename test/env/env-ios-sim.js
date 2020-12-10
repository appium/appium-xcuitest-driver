import moment from 'moment';
import _ from 'lodash';
import envBase from './env-base';
import platformDefinition from './ios-sim-platforms';
import log from './logger';


const platforms = [];

function config () {
  let deviceNameIndex = 0;
  let devicesRemaining;

  // Get a list of tuples containing [PLATFORM_VERSION, DEVICE_NAME]
  do {
    devicesRemaining = false;

    // Do a transpose of all of the device arrays so that we don't get the same
    // OS grouped together
    for (const [platformVersion, devices] of _.toPairs(platformDefinition)) {
      if (devices.length > deviceNameIndex) {
        platforms.push([platformVersion, devices[deviceNameIndex]]);
        devicesRemaining = true;
      }
    }
    deviceNameIndex++;
  } while (devicesRemaining);

  // Get the device based on a 5-day sliding window
  const platformIndex = (moment().dayOfYear() * 5) % platforms.length + (parseInt(process.env.SAUCE_EMUSIM_DEVICE_INDEX, 10) || 0);
  const [CLOUD_PLATFORM_VERSION, CLOUD_DEVICE_NAME] = platforms[platformIndex % platforms.length];

  log.info(`Running tests on iOS ${CLOUD_PLATFORM_VERSION}, device "${CLOUD_DEVICE_NAME}"`);

  return {
    ...envBase,
    SAUCE_EMUSIM: true,
    SAUCE_USERNAME: process.env.SAUCE_USERNAME,
    SAUCE_ACCESS_KEY: process.env.SAUCE_ACCESS_KEY,
    CLOUD_PLATFORM_VERSION: process.env.CLOUD_PLATFORM_VERSION || CLOUD_PLATFORM_VERSION,
    CLOUD_DEVICE_NAME: process.env.CLOUD_DEVICE_NAME || CLOUD_DEVICE_NAME,
  };
}

export { config };
export default config;
