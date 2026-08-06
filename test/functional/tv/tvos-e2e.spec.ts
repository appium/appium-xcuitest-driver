import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, afterEach} from 'node:test';

import {getSimulator} from 'appium-ios-simulator';
import {Simctl} from 'node-simctl';

import {TVOS_CAPS, extractCapabilityValue} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {cleanupSimulator} from '../helpers/simulator.js';

const SIM_DEVICE_NAME = 'xcuitestDriverTest';

const simctl = new Simctl();

describe('tvOS', function () {
  let baseCaps: Record<string, any>;
  let udid: string;

  before(async function () {
    udid = await simctl.createDevice(
      SIM_DEVICE_NAME,
      extractCapabilityValue(TVOS_CAPS, 'appium:deviceName'),
      extractCapabilityValue(TVOS_CAPS, 'appium:platformVersion'),
      {platform: extractCapabilityValue(TVOS_CAPS, 'platformName')},
    );
  });

  after(async function () {
    if (udid) {
      const sim = await getSimulator(udid, {
        platform: extractCapabilityValue(TVOS_CAPS, 'platformName'),
        checkExistence: false,
      });
      await cleanupSimulator(sim);
    }
  });

  beforeEach(function () {
    baseCaps = {...TVOS_CAPS, udid};
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.TVSettings', async function () {
    baseCaps.autoLaunch = true;
    const driver = await initSession(baseCaps);
    assert.ok(await driver.$('~General'));
  });

  it('should launch com.apple.TVSettings with autoLaunch false', async function () {
    baseCaps.autoLaunch = false;
    const driver = await initSession(baseCaps);
    await driver.execute('mobile: activateApp', {bundleId: 'com.apple.TVSettings'});
    assert.ok(await driver.$('~General'));
  });
});
