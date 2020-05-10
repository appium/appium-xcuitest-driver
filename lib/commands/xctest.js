import B from 'bluebird';
import { logger } from 'appium-support';
import log from '../logger';

let helpers = {}, commands = {}, extensions = {};

const xctestLog = logger.getLogger('XCTest');

function assertIDB (opts) {
  if (!opts.device?.idb || !opts.launchWithIDB) {
    log.errorAndThrow(`To use XCTest runner, IDB (https://github.com/facebook/idb) must be installed ` +
      `and sessions must be run with the "launchWithIDB" capability`);
  }
  return opts.device.idb;
}

/**
 * @typedef {Object} RunXCUITestOptions
 *
 * @property {string} testRunnerBundleId Test app bundle
 * @property {string} appUnderTestBundleId App-under-test bundle
 * @property {string} xcTestBundleID xctest bundle
 * @property {string} testType XC test type. 'app', 'ui', or 'logic'
 * @property {object} env 'Environment variables passed to test
 * @property {Array<String>} args Test arguments
 */

/**
 * Run an XCTest
 *
 * @param {RunXCUITestOptions} runXCUITestOptions
 */
commands.mobileRunXCTest = async function runXCTest ({
  testRunnerBundleId,
  appUnderTestBundleId,
  xctestBundleId,
  testType = 'ui',
  env,
  args,
}) {
  assertIDB(this.opts);
  const subproc = await this.opts.device.idb.runXCUITest(
        testRunnerBundleId, appUnderTestBundleId, xctestBundleId, {env, args, testType},
  );

  return await new B((resolve, reject) => {
    subproc.on('output', (stdout, stderr) => {
      stdout && xctestLog.info(stdout);
      stderr && xctestLog.error(stderr);
    });

    subproc.on('exit', (code, signal) => {
      if (code !== 0) {
        const err = new Error('Could not run XCTest');
        err.code = code;
        err.signal = signal;
        return reject(err);
      }
      resolve();
    });
  });
};

/**
 * Install an XCTestBundle
 *
 * @param {string} xctestBundleId - Bundle ID of the test app
 */
commands.mobileInstallXCTestBundle = async function installXCTestBundle (xctestBundle) {
  const idb = assertIDB(this.opts);
  xctestLog.info(`Installing bundle '${xctestBundle}'`);
  const res = await this.helpers.configureApp(xctestBundle, '.xctest');
  await idb.installXCTestBundle(res);
};

/**
 * List XCTest bundles that are installed on device
 *
 * @returns {Array<string>}
 */
commands.mobileListXCTestBundles = async function listXCTestsInTestBundle () {
  const idb = assertIDB(this.opts);
  return await idb.listXCTestBundles();
};

/**
 * List XCTests in a test bundle
 *
 * @param {string} bundle - Bundle ID
 *
 * @returns {Array<string>}
 */
commands.mobileListXCTestsInTestBundle = async function listXCTestsInTestBundle (bundle) {
  const idb = assertIDB(this.opts);
  return await idb.listXCTestsInTestBundle(bundle);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers};
export default extensions;
