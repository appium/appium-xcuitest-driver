import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';

import * as iosSimulatorModule from 'appium-ios-simulator';

const CANONICAL_UDID = '9A7D25307EE8ABD1A0B3C4D5E6F70819AABBCCDD';

let requestedUdid: string | undefined;

mock.module('appium-ios-simulator', {
  namedExports: {
    ...iosSimulatorModule,
    listSimulators: async () => [
      {
        udid: CANONICAL_UDID,
        name: 'iPhone 15',
        state: 'Shutdown',
        platform: 'iOS',
        sdk: '18.0',
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
      },
    ],
    getSimulator: async (udid: string) => {
      requestedUdid = udid;
      return {udid, getPlatformVersion: async () => '18.0'};
    },
  },
});

const {findSimulatorUdidCase, getExistingSim} = await import('../../../lib/device/simulator-management.js');

describe('simulator udid case handling', function () {
  it('findSimulatorUdidCase resolves the canonical simctl-reported case', async function () {
    const canonical = await findSimulatorUdidCase(CANONICAL_UDID.toLowerCase(), undefined, 'iOS');
    assert.strictEqual(canonical, CANONICAL_UDID);
  });

  it('findSimulatorUdidCase returns undefined when no device matches', async function () {
    const canonical = await findSimulatorUdidCase('deadbeef', undefined, 'iOS');
    assert.strictEqual(canonical, undefined);
  });

  it('getExistingSim matches a udid capability that differs only by letter case', async function () {
    requestedUdid = undefined;
    const driver = {log: {debug: () => {}}} as any;
    const sim = await getExistingSim.call(driver, {
      udid: CANONICAL_UDID.toLowerCase(),
      platformVersion: '18.0',
      platformName: 'iOS',
    } as any);
    assert.ok(sim);
    assert.strictEqual(requestedUdid, CANONICAL_UDID);
  });
});
