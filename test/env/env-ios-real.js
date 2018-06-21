import envBase from './env-base';

const platforms = [
  // Stub.
  //['11.2', 'iPhone X Simulator'],
  //['11.2', 'iPad Air Simulator'],
];

const platformIndex = process.env.SAUCE_RDC_CONFIG;

export default {
  envBase,
  SAUCE_RDC: true,
  // TODO: TestObject credentials go here
  // SAUCE_USERNAME: process.env.SAUCE_USERNAME,
  // SAUCE_ACCESS_KEY: process.env.SAUCE_ACCESS_KEY,
  PLATFORM_VERSION: platforms[platformIndex][0],
  DEVICE_NAME: platforms[platformIndex][1],
};