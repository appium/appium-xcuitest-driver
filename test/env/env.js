import _ from 'lodash';
import request from 'sync-request';
import { logger } from 'appium-support';

const log = logger.getLogger('CI STAGING TESTS');

let env = {};


// Get the environment variables
if (!_.isEmpty(process.env.SAUCE_EMUSIM_DEVICE_INDEX) || process.env.SAUCE_EMUSIM) {
  log.info('Running tests on SauceLabs OnDemand');
  Object.assign(env, require('./env-ios-sim'));
} else if (!_.isEmpty(process.env.SAUCE_RDC_DEVICE_INDEX) || process.env.SAUCE_RDC) {
  log.info('Running tests on SauceLabs real device cloud');
  Object.assign(env, require('./env-ios-real'));
}

if (env.CLOUD) {
  // Find the latest bundle
  log.info('Getting the sha of the most recent master commit');
  const res = request('GET', 'https://api.bintray.com/packages/appium-builds/appium/appium/files', {json: true});
  const {name:bundleName} = JSON.parse(res.getBody('utf8'))[0];

  // Get the URL
  const stagingUrl = `https://bintray.com/appium-builds/appium/download_file?file_path=${bundleName}`;
  log.info(`Using staging URL: ${stagingUrl}`);
  env.APPIUM_STAGING_URL = stagingUrl;
}

Object.assign(process.env, env);
