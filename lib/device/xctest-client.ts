import _ from 'lodash';
import type {StringRecord} from '@appium/types';
import type {XCUITestDriver} from '../driver';
import type {XCTestResult, RunXCTestResult} from '../commands/types';
import {
  runXCTestViaRemoteXPC,
  listXCTestBundlesViaRemoteXPC,
  installXCTestBundleViaRemoteXPC,
} from './xctest-remotexpc';
import {isIos18OrNewerPlatform} from '../utils';

const XCTEST_REAL_DEVICE_MSG =
  'This XCTest operation is only supported on real devices running iOS/tvOS 18 or newer with the ' +
  'appium-ios-remotexpc package.';

export class XCTestClient {
  private constructor(private readonly deps: XCTestClientDeps) {}

  static fromDriver(driver: XCUITestDriver): XCTestClient {
    return new XCTestClient({
      udid: driver.device.udid,
      isRealDevice: driver.isRealDevice(),
      platformVersion: driver.opts.platformVersion,
    });
  }

  private assertRealDeviceRemoteXpc(): void {
    if (!this.deps.isRealDevice || !isIos18OrNewerPlatform(this.deps.platformVersion)) {
      throw new Error(XCTEST_REAL_DEVICE_MSG);
    }
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
}

export function parseLegacyXCTestStdout(stdout: string): XCTestResult[] | string[] {
  function parseKey(name: string): string {
    const words = name.split(' ');
    let out = '';
    for (const word of words) {
      out += word.substr(0, 1).toUpperCase() + word.substr(1);
    }
    return out.substr(0, 1).toLowerCase() + out.substr(1);
  }

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

  const lines = stdout.trim().split('\n');
  if (lines.length === 1 && !lines[0].includes('|')) {
    return [lines[0]];
  }

  const results: XCTestResult[] = [];
  for (const line of lines) {
    const properties = line.split('|');
    const output: any = {};
    let entryIndex = 0;

    for (const prop of properties) {
      if (entryIndex === 0) {
        output.testName = prop.trim();
      } else if (prop.trim().startsWith('Location')) {
        output.location = prop.substring(prop.indexOf('Location') + 8).trim();
      } else {
        const [key, value] = prop.split(':');
        output[parseKey(key.trim())] = parseValue(value ? value.trim() : '');
      }
      entryIndex++;
    }

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

    results.push(output);
  }
  return results;
}

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
