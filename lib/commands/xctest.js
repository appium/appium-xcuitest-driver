import B from 'bluebird';
import {logger} from 'appium/support';
import _ from 'lodash';
import {errors} from 'appium/driver';

/**
 * @type {360000}
 */
const XCTEST_TIMEOUT = 360000; // 60 minute timeout

const xctestLog = logger.getLogger('XCTest');

/**
 * Asserts that IDB is present and that launchWithIDB was used
 *
 * @param {XCUITestDriver['opts']} opts Opts object from the driver instance
 */
export function assertIDB(opts) {
  if (!this.device?.idb || !opts.launchWithIDB) {
    throw new Error(
      `To use XCTest runner, IDB (https://github.com/facebook/idb) must be installed ` +
        `and sessions must be run with the "launchWithIDB" capability`,
    );
  }
  return this.device.idb;
}

/**
 * Parse the stdout of XC test log
 * @param {string} stdout A line of standard out from `idb xctest run ...`
 * @returns {XCTestResult[]|string[]} results The final output of the XCTest run
 */
export function parseXCTestStdout(stdout) {
  // Parses a 'key' into JSON format
  function parseKey(name) {
    const words = name.split(' ');
    let out = '';
    for (const word of words) {
      out += word.substr(0, 1).toUpperCase() + word.substr(1);
    }
    return out.substr(0, 1).toLowerCase() + out.substr(1);
  }

  // Parses a 'value' into JSON format
  function parseValue(value) {
    value = value || '';
    switch (value.toLowerCase()) {
      case 'true':
        return true;
      case 'false':
        return false;
      case '':
        return null;
      default:
        break;
    }
    if (!isNaN(value)) {
      if (!_.isString(value)) {
        return 0;
      } else if (value.indexOf('.') > 0) {
        return parseFloat(value);
      }
      return parseInt(value, 10);
    }
    return value;
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

  /** @type {XCTestResult[]} */
  const results = [];
  for (const line of lines) {
    // The properties are split up by pipes and each property
    // has the format "Some Key : Some Value"
    const properties = line.split('|');

    // Parse each property
    /** @type {XCTestResult} */
    const output = /** @type {any} */ ({});
    let entryIndex = 0;
    for (const prop of properties) {
      if (entryIndex === 0) {
        // The first property only contains one string that contains
        // the test name (e.g.: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample')
        output.testName = prop.trim();
      } else if (prop.trim().startsWith('Location')) {
        // The Location property has a value that comes after 'Location' without colon.
        // e.g. Location /path/to/XCTesterAppUITests/XCTesterAppUITests.swift:36
        output.location = prop.substring(prop.indexOf('Location') + 8).trim();
      } else {
        let [key, value] = prop.split(':');
        output[parseKey(key.trim())] = parseValue(value ? value.trim() : '');
      }
      entryIndex++;
    }

    // keep backward compatibility
    // old pattern: XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Passed: True | Crashed: False | Duration: 1.485 | Failure message:  | Location :0
    // latest pattern: XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Status: passed | Duration: 1.9255789518356323
    if (!output.passed) {
      output.passed = output.status === 'passed';
      output.crashed = output.status === 'crashed';
    } else if (!output.status) {
      if (output.passed) {
        output.status = 'passed';
      } else if (output.crashed) {
        output.status = 'crashed';
      } else {
        output.status = 'failed';
      }
    }

    // Add this line to the results
    results.push(output);
  }
  return results;
}

/**
 * @typedef {Error} XCUITestError
 *
 * @property {number} code Subprocess exit code
 * @property {string} signal The signal (SIG*) that caused the process to fail
 * @property {XCTestResult[]} results The output of the failed test (if there is output)
 */

export default {
  /**
   * Run a native XCTest script.
   *
   * Launches a subprocess that runs the XC Test and blocks until it is completed. Parses the stdout of the process and returns its result as an array.
   *
   * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** to run such tests; see [the idb docs](https://fbidb.io/docs/test-execution/) for reference.
   *
   * @param {string} testRunnerBundleId - Test app bundle (e.g.: `io.appium.XCTesterAppUITests.xctrunner`)
   * @param {string} appUnderTestBundleId - App-under-test bundle
   * @param {string} xcTestBundleId - XCTest bundle ID
   * @param {string[]} args - Launch arguments to start the test with (see [reference documentation](https://developer.apple.com/documentation/xctest/xcuiapplication/1500477-launcharguments))
   * @param {'app'|'ui'|'logic'} testType - XC test type
   * @param {import('@appium/types').StringRecord} [env] - Environment variables passed to test
   * @param {number} timeout - Timeout (in ms) for session completion.
   * @throws {XCUITestError} Error thrown if subprocess returns non-zero exit code
   * @returns {Promise<import('./types').RunXCTestResult>} The array of test results
   * @this {XCUITestDriver}
   */
  async mobileRunXCTest(
    testRunnerBundleId,
    appUnderTestBundleId,
    xcTestBundleId,
    args = [],
    testType = 'ui',
    env,
    timeout = XCTEST_TIMEOUT,
  ) {
    const subproc = await assertIDB(this.opts).runXCUITest(
      testRunnerBundleId,
      appUnderTestBundleId,
      xcTestBundleId,
      {env, args, testType},
    );
    return await new B((resolve, reject) => {
      let mostRecentLogObject = null;
      let xctestTimeout;
      let lastErrorMessage = null;
      if (timeout > 0) {
        xctestTimeout = setTimeout(
          () =>
            reject(
              new errors.TimeoutError(
                `Timed out after '${timeout}ms' waiting for XCTest to complete`,
              ),
            ),
          timeout,
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
            this.log.warn(`Failed to parse logs from test output: '${stdout}'`);
            this.log.debug(err.stack);
          }
        }

        if (stderr) {
          lastErrorMessage = stderr;
        }

        stdout && xctestLog.info(stdout);
        stderr && xctestLog.error(stderr);
      });

      subproc.on('exit', (code, signal) => {
        clearTimeout(xctestTimeout);
        if (code !== 0) {
          const err = /** @type {any} */ (new Error(lastErrorMessage || mostRecentLogObject));
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
          code,
          signal,
          results: mostRecentLogObject,
          passed: true,
        });
      });
    });
  },

  /**
   * Installs an XCTest bundle to the device under test.
   *
   * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** for this command to work.
   *
   * @param {string} xctestApp - Path of the XCTest app (URL or filename with extension `.app`)
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async mobileInstallXCTestBundle(xctestApp) {
    if (!_.isString(xctestApp)) {
      throw new errors.InvalidArgumentError(
        `'xctestApp' is a required parameter for 'installXCTestBundle' and ` +
          `must be a string. Found '${xctestApp}'`,
      );
    }
    xctestLog.info(`Installing bundle '${xctestApp}'`);
    const idb = assertIDB(this.opts);
    const res = await this.helpers.configureApp(xctestApp, '.xctest');
    await idb.installXCTestBundle(res);
  },

  /**
   * List XCTest bundles that are installed on the device.
   *
   * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** for this command to work.
   *
   * @returns {Promise<string[]>} List of XCTest bundles (e.g.: `XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance`)
   * @this {XCUITestDriver}
   */
  async mobileListXCTestBundles() {
    return await assertIDB(this.opts).listXCTestBundles();
  },

  /**
   * List XCTests in a test bundle
   *
   * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** for this command to work.
   * @param {string} bundle - Bundle ID of the XCTest
   *
   * @returns {Promise<string[]>} The list of xctests in the test bundle (e.g., `['XCTesterAppUITests.XCTesterAppUITests/testExample', 'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance']`)
   * @this {XCUITestDriver}
   */
  async mobileListXCTestsInTestBundle(bundle) {
    if (!_.isString(bundle)) {
      throw new errors.InvalidArgumentError(
        `'bundle' is a required parameter for 'listXCTestsInTestBundle' and ` +
          `must be a string. Found '${bundle}'`,
      );
    }
    const idb = assertIDB(this.opts);
    return await idb.listXCTestsInTestBundle(bundle);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').XCTestResult} XCTestResult
 */
