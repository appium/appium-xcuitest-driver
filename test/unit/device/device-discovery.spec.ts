import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import * as iosSimulatorModule from 'appium-ios-simulator';

import type {DeviceDiscoveryResult} from '../../../lib/device/device-discovery.js';
import * as realDeviceManagementModule from '../../../lib/device/real-device-management.js';
import * as simulatorManagementModule from '../../../lib/device/simulator-management.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';

const DEVICE_DISCOVERY_PATH = '../../../lib/device/device-discovery.js';

let connectedDevices: string[] = [];
let connectedDevicesRequests = 0;
let simulatorUdidCaseOverride: string | undefined;
let simulatorPlatform = 'iOS';
let getSimulatorImpl: (udid: string) => Promise<any> = async () => {
  throw new Error('No simulator with such udid');
};

mock.module('appium-ios-simulator', {
  namedExports: {
    ...iosSimulatorModule,
    getSimulator: async (udid: string) => await getSimulatorImpl(udid),
  },
});
mock.module('../../../lib/device/real-device-management.js', {
  namedExports: {
    ...realDeviceManagementModule,
    getConnectedDevices: async () => {
      connectedDevicesRequests++;
      return connectedDevices;
    },
  },
});
mock.module('../../../lib/device/simulator-management.js', {
  namedExports: {
    ...simulatorManagementModule,
    findSimulatorByUdid: async () =>
      simulatorUdidCaseOverride ? {udid: simulatorUdidCaseOverride, platform: simulatorPlatform} : undefined,
  },
});

const {DeviceDiscovery} = await import(DEVICE_DISCOVERY_PATH);

function createDiscovery(driverOpts: XCUITestDriverOpts, warn: (msg: string) => void = () => {}) {
  return new DeviceDiscovery({
    driverOpts,
    log: {
      info: () => {},
      debug: () => {},
      warn,
      errorWithException: (msg: string) => new Error(msg),
    },
    detectUdid: async () => {
      throw new Error('Should not be called');
    },
    getExistingSimulator: async () => null,
    createSimulator: async () => {
      throw new Error('Should not be called');
    },
  });
}

async function withPlatform<T>(platform: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {value: platform});
  try {
    return await fn();
  } finally {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  }
}

describe('device discovery', function () {
  describe('explicit udid', function () {
    beforeEach(function () {
      connectedDevicesRequests = 0;
    });

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
      const result = await withPlatform<DeviceDiscoveryResult>('darwin', () =>
        createDiscovery({udid, platformVersion: '18.0'} as XCUITestDriverOpts).determine(),
      );
      assert.strictEqual(result.realDevice, false);
      assert.strictEqual(requestedUdid, simulatorUdidCaseOverride);
      assert.strictEqual(connectedDevicesRequests, 0);
      // the value returned/stored is still the caller's original casing
      assert.strictEqual(result.udid, udid);

      getSimulatorImpl = async () => {
        throw new Error('No simulator with such udid');
      };
      simulatorUdidCaseOverride = undefined;
    });

    describe('simulator platform', function () {
      const udid = '9a7d25307ee8abd1a0b3c4d5e6f70819aabbccdd';

      beforeEach(function () {
        connectedDevices = [];
        simulatorUdidCaseOverride = udid;
        getSimulatorImpl = async (u: string) => ({udid: u, getPlatformVersion: async () => '18.0'});
      });

      afterEach(function () {
        simulatorUdidCaseOverride = undefined;
        simulatorPlatform = 'iOS';
        getSimulatorImpl = async () => {
          throw new Error('No simulator with such udid');
        };
      });

      it('warns, but still uses the simulator, when its platform differs from platformName', async function () {
        simulatorPlatform = 'tvOS';
        const warnings: string[] = [];
        const result = await withPlatform<DeviceDiscoveryResult>('darwin', () =>
          createDiscovery(
            {udid, platformName: 'iOS', platformVersion: '18.0'} as XCUITestDriverOpts,
            (msg) => void warnings.push(msg),
          ).determine(),
        );
        assert.strictEqual(result.realDevice, false);
        assert.strictEqual(warnings.length, 1);
        assert.match(warnings[0], /tvOS simulator.*platformName capability resolves to 'iOS'/);
      });

      it('does not warn when the platforms match', async function () {
        simulatorPlatform = 'tvOS';
        const warnings: string[] = [];
        await withPlatform<DeviceDiscoveryResult>('darwin', () =>
          createDiscovery(
            {udid, platformName: 'tvOS', platformVersion: '18.0'} as XCUITestDriverOpts,
            (msg) => void warnings.push(msg),
          ).determine(),
        );
        assert.deepStrictEqual(warnings, []);
      });
    });

    it('rejects a udid that is neither a simulator nor a connected real device', async function () {
      connectedDevices = ['OTHER'];
      await assert.rejects(
        createDiscovery({udid: 'MISSING', platformVersion: '18.0'} as XCUITestDriverOpts).determine(),
        /Unknown device or simulator UDID: 'MISSING'/,
      );
    });

    it('does not check the real devices when webDriverAgentUrl is set', async function () {
      connectedDevices = [];
      const result = await createDiscovery({
        udid: 'REAL',
        platformVersion: '18.0',
        webDriverAgentUrl: 'http://localhost:8100',
      } as XCUITestDriverOpts).determine();
      assert.strictEqual(result.realDevice, true);
      assert.strictEqual(connectedDevicesRequests, 0);
    });

    it('does not look for simulators on non-macOS hosts', async function () {
      let simulatorRequested = false;
      getSimulatorImpl = async () => {
        simulatorRequested = true;
        throw new Error('No simulator with such udid');
      };
      connectedDevices = ['REAL'];
      const result = await withPlatform<DeviceDiscoveryResult>('linux', () =>
        createDiscovery({udid: 'REAL', platformVersion: '18.0'} as XCUITestDriverOpts).determine(),
      );
      assert.strictEqual(result.realDevice, true);
      assert.strictEqual(simulatorRequested, false);
    });
  });
});
