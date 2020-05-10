import B from 'bluebird';
import { logger } from 'appium-support';
import log from '../logger';
import appManagement from './app-management';

let helpers = {}, commands = {}, extensions = {};

const xctestLog = logger.getLogger('XCTest');

function assertIDB (context) {
  if (!context.opts?.device?.idb) {
    log.errorAndThrow(`To use XCTest runner, IDB (https://github.com/facebook/idb) must be installed ` +
      `and sessions must be run with the "launchWithIDB" capability`);
  }
}

/**
 * Run an XCTest
 *
 * @param {object} params - The parameters that get passed to IDB to run XC test
 *                          * testRunnerBundleId: Bundle ID of the test app
 *                          * appUnderTestBundleId: Bundle ID of the app-under-test
 *                          * xcTestBundleId: Bundle ID of the testrunner
 *                          * testType: 'app', 'ui', or 'logic'
 *                          * opts: Object containing opts.env (environment variables) and
 *                              opts.args (test arguments)
 */
commands.mobileRunXCTest = async function runXCTest ({
  testRunnerBundleId,
  appUnderTestBundleId,
  xctestBundleId,
  testType = 'ui',
  opts = {},
}) {
  assertIDB(this);
  const subproc = await this.opts.device.idb.runXCUITest(
        testRunnerBundleId, appUnderTestBundleId, xctestBundleId, {...opts, testType},
  );

  const p = new B((resolve, reject) => {
    subproc.on('output', (stdout, stderr) => {
      stdout && xctestLog.info(stdout);
      stderr && xctestLog.error(stderr);
    });

    subproc.on('exit', (code, signal) => {
      if (code > 0) {
        return reject({code, signal, message: `Could not run XCTest. Exit status '${code}'`});
      }
      resolve(null);
    });
  });
  return await p;
};

/**
 * Install an XCTestBundle
 *
 * @param {string} xctestBundleId - Bundle ID of the test app
 */
commands.mobileInstallXCTestBundle = async function installXCTestBundle (xctestBundle) {
  assertIDB(this);
  xctestLog.info(`Installing bundle '${xctestBundle}'`);
  return await appManagement.mobileInstallApp.call(this, {app: xctestBundle});
};

/**
 * List XCTest bundles that are installed on device
 */
commands.mobileListXCTestBundles = async function listXCTestsInTestBundle () {
  assertIDB(this);
  return await this.opts.device.idb.listXCTestBundles();
};

/**
 * List XCTests in a test bundle
 *
 * @param {string} bundle - Bundle ID
 */
commands.mobileListXCTestsInTestBundle = async function listXCTestsInTestBundle (bundle) {
  assertIDB(this);
  return await this.opts.device.idb.listXCTestsInTestBundle(bundle);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers};
export default extensions;
