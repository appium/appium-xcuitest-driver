import _ from 'lodash';
import log from './logger';
import configRealDevice from './env-ios-real';
import configSimulator from './env-ios-sim';


let env = {};

if (!process.env.SAUCE_BUILD) {
  // Get the environment variables
  if (!_.isEmpty(process.env.SAUCE_EMUSIM_DEVICE_INDEX) || process.env.SAUCE_EMUSIM) {
    log.info('Running tests on SauceLabs simulator');
    Object.assign(env, configSimulator());
  } else if (!_.isEmpty(process.env.SAUCE_RDC_DEVICE_INDEX) || process.env.SAUCE_RDC) {
    log.info('Running tests on SauceLabs real device');
    Object.assign(env, configRealDevice());
  }

  if (process.env.CLOUD) {
    // get a unique build name for SauceLabs, based on the Travis build number
    // or the current date, for local testing
    env.SAUCE_BUILD = `appium-xcuitest-driver CI: ${process.env.TRAVIS_BUILD_NUMBER || new Date().toISOString()}`;
  }

  Object.assign(process.env, env);
}
