import moment from 'moment';
import envBase from './env-base';
import {log} from './logger';

const platforms = ['10', '11', '10.3', '11.3', '11.4'];

function config() {
  // Get the two platform versions to use based on a sliding window
  const platformIndex = (moment().dayOfYear() * 2) % platforms.length;

  const CLOUD_PLATFORM_VERSION =
    process.env.CLOUD_PLATFORM_VERSION || platforms[platformIndex % platforms.length];

  log.info(
    `Running tests on real, dynamically allocated device with iOS version: ${CLOUD_PLATFORM_VERSION}`,
  );

  return {
    ...envBase,
    REAL_DEVICE: 1,
    CLOUD_PLATFORM_VERSION,
  };
}

export {config};
export default config;
