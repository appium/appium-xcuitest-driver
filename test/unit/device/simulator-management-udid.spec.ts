import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';

import * as iosSimulatorModule from 'appium-ios-simulator';

const CANONICAL_UDID = '9A7D25307EE8ABD1A0B3C4D5E6F70819AABBCCDD';

class FakeSimctl {
  constructor(_opts: Record<string, unknown> = {}) {}

  async getDevices(_forSdk?: string | null, _platform?: string | null): Promise<Record<string, any[]>> {
    return {
      '18.0': [{udid: CANONICAL_UDID, name: 'iPhone 15', state: 'Shutdown'}],
    };
  }
}

let requestedUdid: string | undefined;

// Only Simctl is provided (not a `...nodeSimctlModule` spread): node-simctl's build also has a
// `default` export, and spreading a module namespace that includes one into `namedExports` hits
// a node:test module-mocking bug on Node 22 (`export let default = ...` — a SyntaxError, since
// `default` can't be used as a plain binding name).
mock.module('node-simctl', {
  namedExports: {
    Simctl: FakeSimctl,
  },
});
mock.module('appium-ios-simulator', {
  namedExports: {
    ...iosSimulatorModule,
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
