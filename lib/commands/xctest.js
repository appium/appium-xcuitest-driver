import B from 'bluebird';
import { logger } from 'appium-support';
import log from '../logger';

let commands = {};

const xctestLog = logger.getLogger('XCTest');

/**
 * Asserts that IDB is present and that launchWithIDB was used
 *
 * @param {object} opts Opts object from the driver instance
 */
export function assertIDB (opts) {
  if (!opts.device?.idb || !opts.launchWithIDB) {
    log.errorAndThrow(`To use XCTest runner, IDB (https://github.com/facebook/idb) must be installed ` +
      `and sessions must be run with the "launchWithIDB" capability`);
  }
  return opts.device.idb;
}

/**
 * Parse the stdout of XC test log
 * @param {string} stdout A line of standard out from `idb xctest run ...`
 */
export function parseXCTestStdout (stdout) {
  // Parses a 'key' into JSON format
  function parseKey (name) {
    const words = name.split(' ');
    let out = '';
    for (const word of words) {
      out += word.substr(0, 1).toUpperCase() + word.substr(1);
    }
    return out.substr(0, 1).toLowerCase() + out.substr(1);
  }

  // Parses a 'value' into JSON format
  function parseValue (value) {
    switch (value.toLowerCase()) {
      case 'true': return true;
      case 'false': return false;
      case '': return null;
      default: break;
    }
    if (!isNaN(value)) {
      if (value.indexOf('.') > 0) {
        return parseFloat(value);
      }
      return parseInt(value, 10);
    }
  }
  if (stdout) {
    // Parse each line into an array
    const lines = stdout.trim().split('\n');

    // One single string, just return the string
    if (lines.length === 1 && !lines[0].includes('|')) {
      return lines[0];
    }

    const results = [];
    for (const line of lines) {
      // The properties are split up by pipes and each property
      // has the format "Some Key : Some Value"
      const properties = line.split('|');

      // Parse each property
      const output = {};
      let entryIndex = 0;
      for (let prop of properties) {
        if (entryIndex === 0) {
          // The first property only contains one string that contains
          // the test name (e.g.: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample')
          output.testName = prop.trim();
        } else {
          let [key, value] = prop.split(':');
          output[parseKey(key.trim())] = parseValue(value.trim());
        }
        entryIndex++;
      }
      // Add this line to the results
      results.push(output);
    }
    return results;
  }
}

/**
 * @typedef {Object} RunXCUITestResponse
 *
 * @property {Array<Object>} results The results of all the tests with information (passed, crashed, duration, etc...)
 * @property {number} code The exit code of the process
 * @property {string} signal The signal that terminated the process (or null)
 *
 */

/**
 * @typedef {Object} RunXCUITestOptions
 *
 * @property {string!} testRunnerBundleId Test app bundle
 * @property {string!} appUnderTestBundleId App-under-test bundle
 * @property {string!} xcTestBundleID xctest bundle
 * @property {string} testType [ui] XC test type. 'app', 'ui', or 'logic'
 * @property {object} env 'Environment variables passed to test
 * @property {Array<String>} args Test arguments
 * @returns {RunXCUITestResponse}
 */

/**
 * Run an XCTest. Launches a subprocess that runs the XC test and blocks
 * until it is complete.
 *
 * See https://fbidb.io/docs/test_execution for reference
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
  const subproc = await assertIDB(this.opts).runXCUITest(
        testRunnerBundleId, appUnderTestBundleId, xctestBundleId, {env, args, testType},
  );
  return await new B((resolve, reject) => {
    let mostRecentLogObject = null;
    subproc.on('output', (stdout, stderr) => {
      if (stdout) {
        try {
          mostRecentLogObject = parseXCTestStdout(stdout);
        } catch (e) {
          // Fails silently if log parsing fails.
          // This is in case IDB changes the way that logs are formatted and
          // it breaks the parsing. If that happens we still want the process
          // to finish
        }
      }
      stdout && xctestLog.info(stdout);
      stderr && xctestLog.error(stderr);
    });

    subproc.on('exit', (code, signal) => {
      if (code !== 0) {
        const err = new Error(mostRecentLogObject);
        err.code = code;
        if (signal != null) {
          err.signal = signal;
        }
        return reject(err);
      }
      resolve({
        code, signal, results: mostRecentLogObject, passed: true,
      });
    });
  });
};

/**
 * Install an XCTestBundle
 *
 * @param {string!} xctestBundleId - Bundle ID of the test app
 */
commands.mobileInstallXCTestBundle = async function installXCTestBundle (xctestBundle) {
  xctestLog.info(`Installing bundle '${xctestBundle}'`);
  const idb = assertIDB(this.opts);
  const res = await this.helpers.configureApp(xctestBundle, '.xctest');
  await idb.installXCTestBundle(res);
};

/**
 * List XCTest bundles that are installed on device
 *
 * @returns {Array<string>}
 */
commands.mobileListXCTestBundles = async function listXCTestsInTestBundle () {
  return await assertIDB(this.opts).listXCTestBundles();
};

/**
 * List XCTests in a test bundle
 *
 * @param {string!} bundle - Bundle ID
 *
 * @returns {Array<string>}
 */
commands.mobileListXCTestsInTestBundle = async function listXCTestsInTestBundle (bundle) {
  const idb = assertIDB(this.opts);
  return await idb.listXCTestsInTestBundle(bundle);
};

Object.assign(commands);
export { commands };
export default commands;
