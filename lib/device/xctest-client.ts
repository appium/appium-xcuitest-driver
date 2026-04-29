import type {StringRecord} from '@appium/types';
import type {XCUITestDriver} from '../driver';
import type {RunXCTestResult} from '../commands/types';
import {
  runXCTestViaRemoteXPC,
  listXCTestBundlesViaRemoteXPC,
  installXCTestBundleViaRemoteXPC,
} from './xctest-remotexpc';
import {isIos18OrNewerPlatform} from '../utils';

const XCTEST_REAL_DEVICE_MSG =
  'This XCTest operation is only supported on real devices running iOS/tvOS 18 or newer with the ' +
  'appium-ios-remotexpc package.';

interface XCTestClientDeps {
  udid: string;
  isRealDevice: boolean;
  platformVersion?: string | null;
}

interface RunXCTestOptions {
  testRunnerBundleId: string;
  appUnderTestBundleId: string;
  xcTestBundleId: string;
  args?: string[];
  testType?: 'app' | 'ui' | 'logic';
  env?: StringRecord;
  timeout?: number;
}

export class XCTestClient {
  private constructor(private readonly deps: XCTestClientDeps) {}

  static fromDriver(driver: XCUITestDriver): XCTestClient {
    return new XCTestClient({
      udid: driver.device.udid,
      isRealDevice: driver.isRealDevice(),
      platformVersion: driver.opts.platformVersion,
    });
  }

  async run({
    testRunnerBundleId,
    appUnderTestBundleId,
    xcTestBundleId,
    args = [],
    testType = 'ui',
    env,
    timeout = 360000,
  }: RunXCTestOptions): Promise<RunXCTestResult> {
    this.assertRealDeviceRemoteXpc();
    if (testType === 'logic') {
      throw new Error('Logic XCTests on real devices are not supported.');
    }
    return await runXCTestViaRemoteXPC(
      this.deps.udid,
      testRunnerBundleId,
      appUnderTestBundleId,
      xcTestBundleId,
      testType,
      args,
      env,
      timeout,
    );
  }

  async installBundle(xctestApp: string): Promise<void> {
    this.assertRealDeviceRemoteXpc();
    await installXCTestBundleViaRemoteXPC(this.deps.udid, xctestApp);
  }

  async listBundles(): Promise<string[]> {
    this.assertRealDeviceRemoteXpc();
    return await listXCTestBundlesViaRemoteXPC(this.deps.udid);
  }

  private assertRealDeviceRemoteXpc(): void {
    if (!this.deps.isRealDevice || !isIos18OrNewerPlatform(this.deps.platformVersion)) {
      throw new Error(XCTEST_REAL_DEVICE_MSG);
    }
  }
}
