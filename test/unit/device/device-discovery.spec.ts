import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';

import * as iosSimulatorModule from 'appium-ios-simulator';

import * as realDeviceManagementModule from '../../../lib/device/real-device-management.js';
import * as simulatorManagementModule from '../../../lib/device/simulator-management.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';

const DEVICE_DISCOVERY_PATH = '../../../lib/device/device-discovery.js';

let connectedDevices: string[] = [];
let simulatorUdidCaseOverride: string | undefined;
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

function createDiscovery(driverOpts: XCUITestDriverOpts) {
  return new DeviceDiscovery({
    driverOpts,
    log: {
      info: () => {},
      debug: () => {},
      warn: () => {},
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
});
