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
  // Find the latest git commit
  log.info('Getting the sha of the most recent master commit');

  // (gets the commits synchronously, this is okay because it just does this once before any other scripts are called)
  const commits = request('GET', 'https://api.github.com/repos/appium/appium/commits', {
    headers: {
      'User-Agent': 'node.js'
    },
    auth: {
      user: process.env.GITHUB_USERNAME,
      pass: process.env.GITHUB_TOKEN,
    },
    json: true,
  }).getBody('utf8');
  const sha = JSON.parse(commits)[0].sha;
  log.info(`Most recent commit found is: ${sha}`);

  // Get the URL of the latest
  const stagingUrl = `https://bintray.com/appium-builds/appium/download_file?file_path=appium-${sha}.zip`;
  log.info(`Using staging URL: ${stagingUrl}`);
  env.APPIUM_STAGING_URL = stagingUrl;
}

Object.assign(process.env, env);
