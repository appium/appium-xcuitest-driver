import assert from 'node:assert/strict';
import {describe, it, before, afterEach, after} from 'node:test';

import {getSimulator} from 'appium-ios-simulator';
import {retryInterval} from 'asyncbox';
import {Simctl} from 'node-simctl';
import type {Browser} from 'webdriverio';

import {amendCapabilities, extractCapabilityValue, getUICatalogSimCaps} from '../desired.js';
import {assertSessionClaimIpcTraces, readAppiumLog} from '../helpers/appium-log.js';
import {getFreePort} from '../helpers/ports.js';
import {createRemoteSession, deleteRemoteSession} from '../helpers/session.js';
import {cleanupSimulator, deleteDeviceWithRetry} from '../helpers/simulator.js';

const SIM_DEVICE_NAME = 'xcuitestSessionClaimTest';

async function createDevice() {
  const simctl = new Simctl();
  return await simctl.createDevice(
    SIM_DEVICE_NAME,
    process.env.DEVICE_NAME || 'iPhone 15',
    process.env.PLATFORM_VERSION || '17.4',
  );
}

describe('XCUITestDriver - session udid claim', {skip: !process.env.APPIUM_LOG_PATH}, function () {
  let udid: string;
  let baseCaps: ReturnType<typeof amendCapabilities>;
  let firstDriver: Browser | undefined;
  let secondDriver: Browser | undefined;

  before(async function () {
    udid = await createDevice();
    const uiCatalogSimCaps = await getUICatalogSimCaps();
    baseCaps = amendCapabilities(uiCatalogSimCaps, {
      'appium:udid': udid,
      'appium:usePrebuiltWDA': true,
      'appium:wdaStartupRetries': 0,
      'appium:noReset': true,
    });
  });

  afterEach(async function () {
    await deleteRemoteSession(secondDriver);
    await deleteRemoteSession(firstDriver);
    secondDriver = undefined;
    firstDriver = undefined;
  });

  after(async function () {
    const sim = await getSimulator(udid, {
      platform: 'iOS',
      checkExistence: false,
    });
    await cleanupSimulator(sim);
    await deleteDeviceWithRetry(udid);
  });

  it('should terminate the previous session when a new session claims the same udid', async function () {
    firstDriver = await createRemoteSession(baseCaps);
    assert.strictEqual(typeof firstDriver.sessionId, 'string');
    assert.notStrictEqual(firstDriver.sessionId.length, 0);
    assert.ok(((await firstDriver.$$('XCUIElementTypeWindow')).length as unknown as number) >= 1);

    const firstSessionId = firstDriver.sessionId;
    const wdaLocalPort = await getFreePort();
    secondDriver = await createRemoteSession(
      amendCapabilities(baseCaps, {
        'appium:wdaLocalPort': wdaLocalPort,
      }),
    );

    assert.strictEqual(typeof secondDriver.sessionId, 'string');
    assert.notStrictEqual(secondDriver.sessionId.length, 0);
    assert.notStrictEqual(secondDriver.sessionId, firstSessionId);

    await retryInterval(20, 500, async () => {
      await assert.rejects(
        firstDriver!.getWindowRect(),
        /invalid session id|session is either terminated or not started/i,
      );
    });

    assert.ok(((await secondDriver.$$('XCUIElementTypeWindow')).length as unknown as number) >= 1);
    assert.strictEqual(extractCapabilityValue(baseCaps, 'appium:udid'), udid);

    const appiumLog = await readAppiumLog();
    assert.strictEqual(typeof appiumLog, 'string', 'APPIUM_LOG_PATH must point to a readable log file');
    assertSessionClaimIpcTraces(appiumLog!);
  });
});
