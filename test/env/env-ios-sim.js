import envBase from './env-base';

// Platforms to test on Sauce EmuSim.
// This should be representative of what OS versions and devices we support
const platforms = [
  ['11.2', 'iPhone X Simulator'],
  //['11.2', 'iPad Air Simulator'],
  //['11.2', 'iPhone 7 Simulator'],
  ['11.1', 'iPhone 8 Simulator'],
  //['11.1', 'iPad Simulator'],
  //['11.1', 'iPhone 5s Simulator'],
  ['10.3', 'iPad Air Simulator'],
  //['10.3', 'iPhone 6s Simulator'],
  ['10.2', 'iPhone 5 Simulator'],
  //['10.2', 'iPhone 7 Simulator'],
  //['10', 'iPhone 6 Plus Simulator'],
  ['9.3', 'iPhone 5 Simulator'],
];

const platformIndex = process.env.SAUCE_EMUSIM_CONFIG;

export default {
  ...envBase,
  SAUCE_EMUSIM: true,
  SAUCE_USERNAME: process.env.SAUCE_USERNAME,
  SAUCE_ACCESS_KEY: process.env.SAUCE_ACCESS_KEY,
  PLATFORM_VERSION: platforms[platformIndex][0],
  DEVICE_NAME: platforms[platformIndex][1],
};