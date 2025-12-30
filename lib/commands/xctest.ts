import B from 'bluebird';
import {logger} from 'appium/support';
import _ from 'lodash';
import {errors} from 'appium/driver';
import type {XCUITestDriver} from '../driver';
import type {XCTestResult, RunXCTestResult} from './types';
import type {StringRecord} from '@appium/types';
import type IDB from 'appium-idb';

const XCTEST_TIMEOUT = 360000; // 60 minute timeout

const xctestLog = logger.getLogger('XCTest');

/**
 * Asserts that IDB is present and that launchWithIDB was used.
 *
 * @param opts - Opts object from the driver instance
 * @returns The IDB instance
 * @throws {Error} If IDB is not available or launchWithIDB is not enabled
 */
export function assertIDB(this: XCUITestDriver, opts: XCUITestDriver['opts']): IDB {
  const device = this.device as any;
  if (!device?.idb || !opts.launchWithIDB) {
    throw new Error(
      `To use XCTest runner, IDB (https://github.com/facebook/idb) must be installed ` +
        `and sessions must be run with the "launchWithIDB" capability`,
    );
  }
  return device.idb;
}

/**
 * Parse the stdout of XC test log.
 *
 * @param stdout - A line of standard out from `idb xctest run ...`
 * @returns The final output of the XCTest run
 */
export function parseXCTestStdout(stdout: string): XCTestResult[] | string[] {
  // Parses a 'key' into JSON format
  function parseKey(name: string): string {
    const words = name.split(' ');
    let out = '';
    for (const word of words) {
      out += word.substr(0, 1).toUpperCase() + word.substr(1);
    }
    return out.substr(0, 1).toLowerCase() + out.substr(1);
  }

  // Parses a 'value' into JSON format
  function parseValue(value: string): any {
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
    if (!isNaN(Number(value))) {
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

  const results: XCTestResult[] = [];
  for (const line of lines) {
    // The properties are split up by pipes and each property
    // has the format "Some Key : Some Value"
    const properties = line.split('|');

    // Parse each property
    const output: any = {};
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
        const [key, value] = prop.split(':');
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
 * Error thrown when XCTest subprocess returns non-zero exit code.
 */
export interface XCUITestError extends Error {
  code: number;
  signal?: string;
  result?: XCTestResult[];
}

/**
 * Run a native XCTest script.
 *
 * Launches a subprocess that runs the XC Test and blocks until it is completed. Parses the stdout of the process and returns its result as an array.
 *
 * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** to run such tests; see [the idb docs](https://fbidb.io/docs/test-execution/) for reference.
 *
 * @param testRunnerBundleId - Test app bundle (e.g.: `io.appium.XCTesterAppUITests.xctrunner`)
 * @param appUnderTestBundleId - App-under-test bundle
 * @param xcTestBundleId - XCTest bundle ID
 * @param args - Launch arguments to start the test with (see [reference documentation](https://developer.apple.com/documentation/xctest/xcuiapplication/1500477-launcharguments))
 * @param testType - XC test type
 * @param env - Environment variables passed to test
 * @param timeout - Timeout (in ms) for session completion
 * @returns The array of test results
 * @throws {XCUITestError} Error thrown if subprocess returns non-zero exit code
 */
export async function mobileRunXCTest(
  this: XCUITestDriver,
  testRunnerBundleId: string,
  appUnderTestBundleId: string,
  xcTestBundleId: string,
  args: string[] = [],
  testType: 'app' | 'ui' | 'logic' = 'ui',
  env?: StringRecord,
  timeout = XCTEST_TIMEOUT,
): Promise<RunXCTestResult> {
  const subproc = await assertIDB.call(this, this.opts).runXCUITest(
    testRunnerBundleId,
    appUnderTestBundleId,
    xcTestBundleId,
    {env, args, testType},
  );
  return await new B((resolve, reject) => {
    let mostRecentLogObject: XCTestResult[] | string[] | null = null;
    let xctestTimeout: NodeJS.Timeout | undefined;
    let lastErrorMessage: string | null = null;
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

    subproc.on('output', (stdout: string, stderr: string) => {
      if (stdout) {
        try {
          mostRecentLogObject = parseXCTestStdout(stdout);
        } catch (err: any) {
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
        xctestLog.error(stderr);
      }
      if (stdout) {
        xctestLog.info(stdout);
      }
    });

    subproc.on('exit', (code: number | null, signal: string | null) => {
      if (xctestTimeout) {
        clearTimeout(xctestTimeout);
      }
      if (code !== 0) {
        const err = new Error(lastErrorMessage || String(mostRecentLogObject)) as XCUITestError;
        err.code = code ?? -1;
        if (signal != null) {
          err.signal = signal;
        }
        if (mostRecentLogObject) {
          err.result = mostRecentLogObject as XCTestResult[];
        }
        return reject(err);
      }
      resolve({
        code: code ?? 0,
        signal: signal ?? null,
        results: mostRecentLogObject as XCTestResult[],
        passed: true,
      });
    });
  });
}

/**
 * Installs an XCTest bundle to the device under test.
 *
 * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** for this command to work.
 *
 * @param xctestApp - Path of the XCTest app (URL or filename with extension `.app`)
 */
export async function mobileInstallXCTestBundle(
  this: XCUITestDriver,
  xctestApp: string,
): Promise<void> {
  if (!_.isString(xctestApp)) {
    throw new errors.InvalidArgumentError(
      `'xctestApp' is a required parameter for 'installXCTestBundle' and ` +
        `must be a string. Found '${xctestApp}'`,
    );
  }
  xctestLog.info(`Installing bundle '${xctestApp}'`);
  const idb = assertIDB.call(this, this.opts);
  const res = await this.helpers.configureApp(xctestApp, '.xctest');
  await idb.installXCTestBundle(res);
}

/**
 * List XCTest bundles that are installed on the device.
 *
 * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** for this command to work.
 *
 * @returns List of XCTest bundles (e.g.: `XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance`)
 */
export async function mobileListXCTestBundles(this: XCUITestDriver): Promise<string[]> {
  return await assertIDB.call(this, this.opts).listXCTestBundles();
}

/**
 * List XCTests in a test bundle.
 *
 * **Facebook's [IDB](https://github.com/facebook/idb) tool is required** for this command to work.
 *
 * @param bundle - Bundle ID of the XCTest
 * @returns The list of xctests in the test bundle (e.g., `['XCTesterAppUITests.XCTesterAppUITests/testExample', 'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance']`)
 */
export async function mobileListXCTestsInTestBundle(
  this: XCUITestDriver,
  bundle: string,
): Promise<string[]> {
  if (!_.isString(bundle)) {
    throw new errors.InvalidArgumentError(
      `'bundle' is a required parameter for 'listXCTestsInTestBundle' and ` +
        `must be a string. Found '${bundle}'`,
    );
  }
  const idb = assertIDB.call(this, this.opts);
  return await idb.listXCTestsInTestBundle(bundle);
}

