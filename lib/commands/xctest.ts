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
 * Supported only on **real devices** running **iOS/tvOS 18+** with the optional **appium-ios-remotexpc**
 * package installed. UI and app test types use RemoteXPC. Logic tests are not supported (they depended on
 * removed Facebook IDB integration). Simulator XCTest via IDB was removed in driver v11.
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
 * Supported only on real devices running iOS/tvOS 18+ with appium-ios-remotexpc. Use a `.app` or `.ipa`;
 * bare `.xctest` bundles are not supported via RemoteXPC.
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
 * Supported only on real devices running iOS/tvOS 18+ with appium-ios-remotexpc.
 *
 * @returns List of XCTest bundles (e.g.: `XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance`)
 */
export async function mobileListXCTestBundles(this: XCUITestDriver): Promise<string[]> {
  return await XCTestClient.fromDriver(this).listBundles();
}
