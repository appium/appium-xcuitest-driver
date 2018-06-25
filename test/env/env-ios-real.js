import moment from 'moment';
import envBase from './env-base';
import { logger } from 'appium-support';

const platforms = [
  '11'
];

const configIndex = process.env.SAUCE_RDC_DEVICE_INDEX || 0;

// Get the two platform versions to use based on a sliding window
const platformIndex = (moment().dayOfYear() * 2) % platforms.length + (parseInt(configIndex, 0) || 0);

const CLOUD_PLATFORM_VERSION = process.env.CLOUD_PLATFORM_VERSION || platforms[platformIndex];

logger.getLogger('CI STAGING TESTS').info(`Running tests on real, dynamically allocated device with iOS version: ${CLOUD_PLATFORM_VERSION}`);

export default {
  ...envBase,
  REAL_DEVICE: 1,
  SAUCE_RDC: true,
  SAUCE_RDC_USERNAME: process.env.TESTOBJECT_USERNAME || process.env.SAUCE_USERNAME,
  SAUCE_RDC_ACCESS_KEY: process.env.TESTOBJECT_API_KEY || process.env.SAUCE_ACCESS_KEY,
  CLOUD_PLATFORM_VERSION,
};