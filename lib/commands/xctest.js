import B from 'bluebird';
import { logger } from 'appium-support';
import _ from 'lodash';
import log from '../logger';

let commands = {};

const XCTEST_TIMEOUT = 60 * 60 * 1000; // 60 minute timeout

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
 * @typedef {Object} XCTestResult
 *
 * @property {string} testName Name of the test (e.g.: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample')
 * @property {boolean} passed Did the tests pass?
 * @property {boolean} crashed Did the tests crash?
 * @property {number} duration How long did the tests take (in seconds)
 * @property {string} failureMessage Failure message (if applicable)
 * @property {number} location The geolocation of the tests (if applicable)
 */

/**
 * Parse the stdout of XC test log
 * @param {string} stdout A line of standard out from `idb xctest run ...`
 * @returns {Array<XCTestResult>} results The final output of the XCTest run
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
    value = value || '';
    switch (value.toLowerCase()) {
      case 'true': return true;
      case 'false': return false;
      case '': return null;
      default: break;
    }
    if (!isNaN(value)) {
      if (!_.isString(value)) {
        return 0;
      } else if (value.indexOf('.') > 0) {
        return parseFloat(value);
      }
      return parseInt(value, 10);
    }
  }
  if (!stdout) {
    return [];
  }

  // Parse each line into an array
  const lines = stdout.trim().split('\n');

  // One single string, just return the string
  if (lines.length === 1 && !lines[0].includes('|')) {
    return [lines[0]];
  }

  const results = [];
  for (const line of lines) {
    // The properties are split up by pipes and each property
    // has the format "Some Key : Some Value"
    const properties = line.split('|');

    // Parse each property
    const output = {};
    let entryIndex = 0;
    for (const prop of properties) {
      if (entryIndex === 0) {
        // The first property only contains one string that contains
        // the test name (e.g.: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample')
        output.testName = prop.trim();
      } else {

        let [key, value] = prop.split(':');
        output[parseKey(key.trim())] = parseValue(value ? value.trim() : '');
      }
      entryIndex++;
    }
    // Add this line to the results
    results.push(output);
  }
  return results;
}

/**
 * @typedef {Object} RunXCUITestResponse
 *
 * @property {Array<XCTestResult>} results The results of all the tests with information
 * @property {number} code The exit code of the process
 * @property {string} signal The signal that terminated the process (or null) (e.g.: SIGTERM)
 *
 */

/**
 * @typedef {Object} RunXCUITestOptions
 *
 * @property {!string} testRunnerBundleId Test app bundle (e.g.: 'io.appium.XCTesterAppUITests.xctrunner')
 * @property {!string} appUnderTestBundleId App-under-test bundle
 * @property {!string} xcTestBundleID xctest bundle id
 * @property {string} testType [ui] XC test type. 'app', 'ui', or 'logic'
 * @property {object} env Environment variables passed to test
 * @property {Array<String>} args Launch arguments to start the test with (see https://developer.apple.com/documentation/xctest/xcuiapplication/1500477-launcharguments for reference)
 * @property {number} timeout [360000] Timeout if session doesn't complete after given time (in milliseconds)
 */


/**
 * @typedef {Error} XCUITestError
 *
 * @property {number} code Subprocess exit code
 * @property {string} signal The signal (SIG*) that caused the process to fail
 * @property {!Array<XCTestResult>} results The output of the failed test (if there is output)
 */

/**
 * Run an XCTest. Launches a subprocess that runs the XC Test and blocks
 * until it is complete. Parses the stdout of the process and returns
 * result as an array
 *
 * See https://fbidb.io/docs/test_execution for reference
 *
 * @param {RunXCUITestOptions} runXCUITestOptions
 * @throws {XCUITestError} Error thrown if subprocess returns non-zero exit code
 * @returns {RunXCUITestResponse}
 */
commands.mobileRunXCTest = async function runXCTest ({
  testRunnerBundleId,
  appUnderTestBundleId,
  xctestBundleId,
  testType = 'ui',
  env,
  args,
  timeout = XCTEST_TIMEOUT,
}) {
  const subproc = await assertIDB(this.opts).runXCUITest(
        testRunnerBundleId, appUnderTestBundleId, xctestBundleId, {env, args, testType},
  );
  return await new B((resolve, reject) => {
    let mostRecentLogObject = null;
    let xctestTimeout;
    if (timeout > 0) {
      xctestTimeout = setTimeout(
        () => reject(`Timed out after '${timeout}ms' waiting for XCTest to complete`),
        timeout
      );
    }

    subproc.on('output', (stdout, stderr) => {
      if (stdout) {
        try {
          mostRecentLogObject = parseXCTestStdout(stdout);
        } catch (err) {
          // Fails if log parsing fails.
          // This is in case IDB changes the way that logs are formatted and
          // it breaks 'parseXCTestStdout'. If that happens we still want the process
          // to finish
          log.warn(`Failed to parse logs from test output: '${stdout}'`);
          log.debug(err.stack);
        }
      }
      stdout && xctestLog.info(stdout);
      stderr && xctestLog.error(stderr);
    });

    subproc.on('exit', (code, signal) => {
      clearTimeout(xctestTimeout);
      if (code !== 0) {
        const err = new Error(mostRecentLogObject);
        err.code = code;
        if (signal != null) {
          err.signal = signal;
        }
        if (mostRecentLogObject) {
          err.result = mostRecentLogObject;
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
 * @typedef {Object} InstallXCTestBundleOpts
 *
 * @property {xctestApp} xctestBundle Path of the XCTest app (URL or .app)
 */

/**
 * Install an XCTestBundle
 *
 * @param {InstallXCTestBundleOpts!} opts Install xctest bundle opts
 */
commands.mobileInstallXCTestBundle = async function installXCTestBundle (opts) {
  const { xctestApp } = opts;
  if (!_.isString(xctestApp)) {
    log.errorAndThrow(`'xctestApp' is a required parameter for 'installXCTestBundle' and ` +
      `must be a string. Found '${xctestApp}'`);
  }
  xctestLog.info(`Installing bundle '${xctestApp}'`);
  const idb = assertIDB(this.opts);
  const res = await this.helpers.configureApp(xctestApp, '.xctest');
  await idb.installXCTestBundle(res);
};

/**
 * List XCTest bundles that are installed on device
 *
 * @returns {Array<string>} List of XCTest bundles (e.g.: "XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance")
 */
commands.mobileListXCTestBundles = async function listXCTestsInTestBundle () {
  return await assertIDB(this.opts).listXCTestBundles();
};

/**
 * @typedef {Object} ListXCTestsOpts
 *
 * @property {!string} bundle Bundle ID of the XCTest
 */

/**
 * List XCTests in a test bundle
 *
 * @param {!ListXCTestsOpts} opts XCTest list options
 *
 * @returns {Array<string>} The list of xctests in the test bundle
 *    (e.g.: [ 'XCTesterAppUITests.XCTesterAppUITests/testExample',
                'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance' ] )
 */
commands.mobileListXCTestsInTestBundle = async function listXCTestsInTestBundle (opts) {
  const { bundle } = opts;
  if (!_.isString(bundle)) {
    log.errorAndThrow(`'bundle' is a required parameter for 'listXCTestsInTestBundle' and ` +
      `must be a string. Found '${bundle}'`);
  }
  const idb = assertIDB(this.opts);
  return await idb.listXCTestsInTestBundle(bundle);
};

Object.assign(commands);
export { commands };
export default commands;
