import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import * as iosSimulatorModule from 'appium-ios-simulator';

import * as xcodeHelpersModule from '../../../lib/commands/helpers/xcode.js';
import * as realDeviceManagementModule from '../../../lib/device/real-device-management.js';
import * as simulatorManagementModule from '../../../lib/device/simulator-management.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';

const DEVICE_DISCOVERY_PATH = '../../../lib/device/device-discovery.js';

let connectedDevices: string[] = [];
let simulatorUdidCaseOverride: string | undefined;
let getSimulatorImpl: (udid: string) => Promise<any> = async () => {
  throw new Error('No simulator with such udid');
};
let infoLogs: string[] = [];
/** SDK versions returned per session platform by the mocked xcode helpers. */
const sdkVersionsByPlatform: Record<string, string> = {
  iOS: '18.4',
  tvOS: '18.2',
  watchOS: '26.5',
};
let sdkVersionRequests: string[] = [];
let requestedSimulatorOpts: XCUITestDriverOpts[] = [];
let existingSimulatorImpl: (opts: XCUITestDriverOpts) => Promise<any> = async () => null;

// device-discovery.ts consumes the SDK getter from the helper module directly, so that is the
// specifier to mock (see driver.spec.ts for the module-binding rules).
mock.module('../../../lib/commands/helpers/xcode.js', {
  namedExports: {
    ...xcodeHelpersModule,
    getAndCheckMaxSdkVersion: async (platformName: string | null | undefined) => {
      sdkVersionRequests.push(String(platformName));
      return sdkVersionsByPlatform[String(platformName)];
    },
  },
});

mock.module('appium-ios-simulator', {
  namedExports: {
    ...iosSimulatorModule,
    getSimulator: async (udid: string) => await getSimulatorImpl(udid),
  },
});
mock.module('../../../lib/device/real-device-management.js', {
  namedExports: {
    ...realDeviceManagementModule,
    getConnectedDevices: async () => connectedDevices,
  },
});
mock.module('../../../lib/device/simulator-management.js', {
  namedExports: {
    ...simulatorManagementModule,
    findSimulatorUdidCase: async () => simulatorUdidCaseOverride,
  },
});

const {DeviceDiscovery} = await import(DEVICE_DISCOVERY_PATH);

/** Runs `fn` pretending the driver runs on macOS, where Simulator discovery is available. */
async function withDarwinHostAsync(fn: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {value: 'darwin'});
  try {
    await fn();
  } finally {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  }
}

function createDiscovery(driverOpts: XCUITestDriverOpts) {
  return new DeviceDiscovery({
    driverOpts,
    log: {
      info: (msg: string) => {
        infoLogs.push(msg);
      },
      debug: () => {},
      warn: () => {},
      errorWithException: (msg: string) => new Error(msg),
    },
    detectUdid: async () => {
      throw new Error('Should not be called');
    },
    getExistingSimulator: async (opts: XCUITestDriverOpts) => {
      requestedSimulatorOpts.push(opts);
      return await existingSimulatorImpl(opts);
    },
    createSimulator: async (opts: XCUITestDriverOpts) => {
      requestedSimulatorOpts.push(opts);
      throw new Error('Should not be called');
    },
  });
}

describe('device discovery', function () {
  describe('explicit udid', function () {
    it('matches a connected real device whose udid differs only by letter case', async function () {
      connectedDevices = ['9A7D25307EE8ABD1A0B3C4D5E6F70819AABBCCDD'];
      const udid = '9a7d25307ee8abd1a0b3c4d5e6f70819aabbccdd';
      const result = await createDiscovery({udid, platformVersion: '18.0'} as XCUITestDriverOpts).determine();
      assert.strictEqual(result.realDevice, true);
      assert.strictEqual(result.udid, udid);
    });

    it('resolves a simulator udid capability that differs only by letter case', async function () {
      connectedDevices = [];
      simulatorUdidCaseOverride = '9A7D25307EE8ABD1A0B3C4D5E6F70819AABBCCDD';
      let requestedUdid: string | undefined;
      getSimulatorImpl = async (udid: string) => {
        requestedUdid = udid;
        return {udid, getPlatformVersion: async () => '18.0'};
      };
      const udid = '9a7d25307ee8abd1a0b3c4d5e6f70819aabbccdd';
      const result = await createDiscovery({udid, platformVersion: '18.0'} as XCUITestDriverOpts).determine();
      assert.strictEqual(result.realDevice, false);
      assert.strictEqual(requestedUdid, simulatorUdidCaseOverride);
      // the value returned/stored is still the caller's original casing
      assert.strictEqual(result.udid, udid);

      getSimulatorImpl = async () => {
        throw new Error('No simulator with such udid');
      };
      simulatorUdidCaseOverride = undefined;
    });
  });

  describe('simulator platform version default', function () {
    beforeEach(function () {
      connectedDevices = [];
      sdkVersionRequests = [];
      infoLogs = [];
      requestedSimulatorOpts = [];
      existingSimulatorImpl = async () => null;
    });
    afterEach(function () {
      existingSimulatorImpl = async () => null;
    });

    it('defaults a watchOS session to the max watchOS SDK version', async function () {
      await withDarwinHostAsync(async () => {
        existingSimulatorImpl = async () => ({udid: 'WATCH-UDID', getPlatformVersion: async () => '26.5'});
        const result = await createDiscovery({
          platformName: 'watchOS',
          deviceName: 'Apple Watch Series 11 (46mm)',
        } as XCUITestDriverOpts).determine();

        assert.deepStrictEqual(sdkVersionRequests, ['watchOS']);
        assert.strictEqual(result.platformVersion, '26.5');
        assert.strictEqual(result.iosSdkVersion, '26.5');
        assert.strictEqual(requestedSimulatorOpts[0].platformVersion, '26.5');
        assert.ok(
          infoLogs.includes("watchOS SDK Version set to '26.5'"),
          `expected a watchOS-specific SDK log, got: ${JSON.stringify(infoLogs)}`,
        );
        assert.ok(!infoLogs.some((line) => line.includes('iOS SDK')));
        assert.ok(
          infoLogs.some(
            (line) =>
              line.startsWith('No platformVersion specified. Using the latest watchOS version Xcode supports: ') &&
              line.includes('This may cause problems if a simulator does not exist for this platform version.'),
          ),
          `expected the missing-platformVersion warning, got: ${JSON.stringify(infoLogs)}`,
        );
      });
    });

    it('defaults a tvOS session to the max tvOS SDK version', async function () {
      await withDarwinHostAsync(async () => {
        existingSimulatorImpl = async () => ({udid: 'TV-UDID', getPlatformVersion: async () => '18.2'});
        const result = await createDiscovery({
          platformName: 'tvOS',
          deviceName: 'Apple TV 4K (3rd generation)',
        } as XCUITestDriverOpts).determine();

        assert.deepStrictEqual(sdkVersionRequests, ['tvOS']);
        assert.strictEqual(result.platformVersion, '18.2');
        assert.strictEqual(result.iosSdkVersion, '18.2');
        assert.ok(
          infoLogs.includes("tvOS SDK Version set to '18.2'"),
          `expected a tvOS-specific SDK log, got: ${JSON.stringify(infoLogs)}`,
        );
      });
    });

    it('keeps using the iOS SDK version for iOS sessions', async function () {
      await withDarwinHostAsync(async () => {
        existingSimulatorImpl = async () => ({udid: 'IOS-UDID', getPlatformVersion: async () => '18.4'});
        const result = await createDiscovery({
          platformName: 'iOS',
          deviceName: 'iPhone 16',
        } as XCUITestDriverOpts).determine();

        assert.deepStrictEqual(sdkVersionRequests, ['iOS']);
        assert.strictEqual(result.platformVersion, '18.4');
        assert.strictEqual(result.iosSdkVersion, '18.4');
        assert.ok(
          infoLogs.includes("iOS SDK Version set to '18.4'"),
          `expected an iOS-specific SDK log, got: ${JSON.stringify(infoLogs)}`,
        );
      });
    });

    it('treats a missing platformName as iOS', async function () {
      await withDarwinHostAsync(async () => {
        existingSimulatorImpl = async () => ({udid: 'IOS-UDID', getPlatformVersion: async () => '18.4'});
        const result = await createDiscovery({deviceName: 'iPhone 16'} as XCUITestDriverOpts).determine();

        assert.deepStrictEqual(sdkVersionRequests, ['iOS']);
        assert.strictEqual(result.iosSdkVersion, '18.4');
        assert.strictEqual(result.platformVersion, '18.4');
      });
    });

    it('keeps an explicitly requested platformVersion while still reporting the platform SDK', async function () {
      await withDarwinHostAsync(async () => {
        existingSimulatorImpl = async () => ({udid: 'WATCH-UDID', getPlatformVersion: async () => '11.5'});
        const result = await createDiscovery({
          platformName: 'watchOS',
          deviceName: 'Apple Watch Series 9 (45mm)',
          platformVersion: '11.5',
        } as XCUITestDriverOpts).determine();

        assert.deepStrictEqual(sdkVersionRequests, ['watchOS']);
        assert.strictEqual(result.platformVersion, '11.5');
        assert.strictEqual(result.iosSdkVersion, '26.5');
        assert.strictEqual(requestedSimulatorOpts[0].platformVersion, '11.5');
        assert.ok(
          !infoLogs.some((line) => line.startsWith('No platformVersion specified.')),
          `did not expect the missing-platformVersion warning, got: ${JSON.stringify(infoLogs)}`,
        );
      });
    });
  });
});
