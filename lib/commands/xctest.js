import B from 'bluebird';
import { logger } from 'appium-support';

let helpers = {}, commands = {}, extensions = {};

// TODO: Show helpful error if user didn't launch with IDB
// TODO: Add JSDocs
// TODO: Make the XCTest bundle downloadable as a zip file
// TODO: Add this to Continuous Integration

const xctestLog = logger.getLogger('XCTest');

commands.mobileRunXCTest = async function runXCTest ({
  testRunnerBundleId,
  appUnderTestBundleId,
  xctestBundleId,
  testType = 'ui',
  opts = {},
}) {
  const subproc = await this.opts.device.idb.runXCUITest(
        testRunnerBundleId, appUnderTestBundleId, xctestBundleId, testType, opts,
  );

  const p = new B((resolve, reject) => {
    subproc.on('output', (stdout, stderr) => {
      stdout && xctestLog.info(stdout);
      stderr && xctestLog.error(stderr);
    });

    subproc.on('exit', (code, signal) => {
      if (code > 0) {
        return reject({code, signal, message: 'Could not run XCTest'});
      }
      resolve(null);
    });
  });
  return await p;
};

commands.mobileInstallXCTestBundle = async function installXCTestBundle (xctestBundle) {
  xctestLog.info(`Installing bundle '${xctestBundle}'`);
  return await this.opts.device.idb.installXCTestBundle(xctestBundle);
};

commands.mobileListXCTestBundles = async function listXCTestsInTestBundle () {
  return await this.opts.device.idb.listXCTestBundles();
};

commands.mobileListXCTestsInTestBundle = async function listXCTestsInTestBundle (bundle) {
  return await this.opts.device.idb.listXCTestsInTestBundle(bundle);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers};
export default extensions;
