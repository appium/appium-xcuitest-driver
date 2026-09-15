import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';

import * as iosSimulatorModule from 'appium-ios-simulator';

import * as realDeviceManagementModule from '../../../lib/device/real-device-management.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';

const DEVICE_DISCOVERY_PATH = '../../../lib/device/device-discovery.js';

let connectedDevices: string[] = [];

mock.module('appium-ios-simulator', {
  namedExports: {
    ...iosSimulatorModule,
    getSimulator: async () => {
      throw new Error('No simulator with such udid');
    },
  },
});
mock.module('../../../lib/device/real-device-management.js', {
  namedExports: {
    ...realDeviceManagementModule,
    getConnectedDevices: async () => connectedDevices,
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
  });
});
