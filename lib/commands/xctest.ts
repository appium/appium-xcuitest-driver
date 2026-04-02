import {logger} from 'appium/support';
import _ from 'lodash';
import {errors} from 'appium/driver';
import type {XCUITestDriver} from '../driver';
import type {RunXCTestResult} from './types';
import type {StringRecord} from '@appium/types';
import {XCTestClient} from '../device/xctest-client';

const XCTEST_TIMEOUT = 360000; // 6 minute timeout

const xctestLog = logger.getLogger('XCTest');

/**
 * Run a native XCTest script.
 *
 * Launches a subprocess that runs the XC Test and blocks until it is completed. Parses the stdout of the process and returns its result as an array.
 *
 * Uses RemoteXPC on iOS/tvOS 18+ real devices (except logic tests), and falls back to
 * **Facebook's [IDB](https://github.com/facebook/idb)** when RemoteXPC is unavailable.
 * IDB is required for non-RemoteXPC execution paths.
 *
 * @param testRunnerBundleId - Test app bundle (e.g.: `io.appium.XCTesterAppUITests.xctrunner`)
 * @param appUnderTestBundleId - App-under-test bundle
 * @param xcTestBundleId - XCTest bundle ID
 * @param args - Launch arguments to start the test with (see [reference documentation](https://developer.apple.com/documentation/xctest/xcuiapplication/1500477-launcharguments))
 * @param testType - XC test type
 * @param env - Environment variables passed to test
 * @param timeout - Timeout (in ms) for session completion
 * @returns The array of test results
 * @throws {Error} Error thrown if XCTest execution fails
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
  return await XCTestClient.fromDriver(this).run({
    testRunnerBundleId,
    appUnderTestBundleId,
    xcTestBundleId,
    args,
    testType,
    env,
    timeout,
  });
}

/**
 * Installs an XCTest bundle to the device under test.
 *
 * Uses RemoteXPC on iOS/tvOS 18+ real devices and falls back to
 * **Facebook's [IDB](https://github.com/facebook/idb)** when needed.
 * IDB is required for fallback/legacy execution paths.
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
  const res = await this.helpers.configureApp(xctestApp, '.xctest');
  await XCTestClient.fromDriver(this).installBundle(res);
}

/**
 * List XCTest bundles that are installed on the device.
 *
 * Uses RemoteXPC on iOS/tvOS 18+ real devices and falls back to
 * **Facebook's [IDB](https://github.com/facebook/idb)** when needed.
 * IDB is required for fallback/legacy execution paths.
 *
 * @returns List of XCTest bundles (e.g.: `XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance`)
 */
export async function mobileListXCTestBundles(this: XCUITestDriver): Promise<string[]> {
  return await XCTestClient.fromDriver(this).listBundles();
}

/**
 * List XCTests in a test bundle.
 *
 * This command currently uses the legacy
 * **Facebook's [IDB](https://github.com/facebook/idb)** path.
 * IDB is required.
 *
 * @param bundle - Bundle ID of the XCTest
 * @returns The list of xctests in the test bundle (e.g., `['XCTesterAppUITests.XCTesterAppUITests/testExample', 'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance']`)
 * @deprecated Scheduled for removal together with the IDB client.
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
  return await XCTestClient.fromDriver(this).listTestsInBundle(bundle);
}
