import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, afterEach} from 'node:test';

import {getSimulator} from 'appium-ios-simulator';
import {Simctl} from 'node-simctl';

import {WATCHOS_CAPS, extractCapabilityValue} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {cleanupSimulator} from '../helpers/simulator.js';

const SIM_DEVICE_NAME = 'xcuitestDriverTest';

const simctl = new Simctl();

describe('watchOS', function () {
  let baseCaps: Record<string, any>;
  let udid: string;

  before(async function () {
    udid = await simctl.createDevice(
      SIM_DEVICE_NAME,
      extractCapabilityValue(WATCHOS_CAPS, 'appium:deviceName'),
      extractCapabilityValue(WATCHOS_CAPS, 'appium:platformVersion'),
      {platform: extractCapabilityValue(WATCHOS_CAPS, 'platformName')},
    );
  });

  after(async function () {
    if (udid) {
      const sim = await getSimulator(udid, {
        platform: extractCapabilityValue(WATCHOS_CAPS, 'platformName'),
        checkExistence: false,
      });
      await cleanupSimulator(sim);
    }
  });

  beforeEach(function () {
    baseCaps = {...WATCHOS_CAPS, udid};
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.NanoSettings', async function () {
    baseCaps.autoLaunch = true;
    const driver = await initSession(baseCaps);
    assert.ok(await driver.$('~General'));
  });

  it('should launch com.apple.NanoSettings with autoLaunch false', async function () {
    baseCaps.autoLaunch = false;
    const driver = await initSession(baseCaps);
    await driver.execute('mobile: activateApp', {bundleId: 'com.apple.NanoSettings'});
    assert.ok(await driver.$('~General'));
  });
});
