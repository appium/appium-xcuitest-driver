import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, afterEach} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {getSimulator} from 'appium-ios-simulator';
import {retryInterval} from 'asyncbox';
import axios from 'axios';
import {Simctl} from 'node-simctl';
import type {Browser} from 'webdriverio';

import {UICATALOG_BUNDLE_ID} from '../../setup.js';
import {
  getUICatalogSimCaps,
  amendCapabilities,
  extractCapabilityValue,
  PLATFORM_VERSION,
  DEVICE_NAME,
} from '../desired.js';
import {initSession, deleteSession, HOST} from '../helpers/session.js';
import {killAllSimulators, deleteDeviceWithRetry, cleanupSimulator} from '../helpers/simulator.js';

const SIM_DEVICE_NAME = 'xcuitestDriverTest';

const simctl = new Simctl();

async function createDevice() {
  return await simctl.createDevice(SIM_DEVICE_NAME, DEVICE_NAME, PLATFORM_VERSION);
}

async function getNumSims() {
  return (await simctl.getDevices())[PLATFORM_VERSION].length;
}

describe('XCUITestDriver', function () {
  let baseCaps: Record<string, any>;
  let caps: Record<string, any>;
  let driver: Browser;

  before(async function () {
    const udid = await createDevice();
    const uiCatalogSimCaps = await getUICatalogSimCaps();
    baseCaps = amendCapabilities(uiCatalogSimCaps, {'appium:udid': udid});
    caps = amendCapabilities(baseCaps, {
      'appium:usePrebuiltWDA': true,
      'appium:wdaStartupRetries': 0,
    });
  });
  after(async function () {
    const sim = await getSimulator(extractCapabilityValue(caps, 'appium:udid'), {
      platform: 'iOS',
      checkExistence: false,
    });
    await cleanupSimulator(sim);
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  it('should start and stop a session', async function () {
    driver = await initSession(baseCaps);
    const els = await driver.$$('XCUIElementTypeWindow');
    assert.ok((els.length as unknown as number) >= 1);
  });

  it('should start and stop a session doing pre-build', async function () {
    driver = await initSession(amendCapabilities(baseCaps, {'appium:prebuildWDA': true}));
    const els = await driver.$$('XCUIElementTypeWindow');
    assert.ok((els.length as unknown as number) >= 1);
  });

  it('should start and stop a session with only bundle id', async function () {
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': UICATALOG_BUNDLE_ID,
      'appium:noReset': true,
      'appium:app': undefined,
    });
    await assert.doesNotReject(initSession(localCaps));
  });

  it('should start and stop a session with only bundle id when no sim is running', async function () {
    await killAllSimulators();
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': UICATALOG_BUNDLE_ID,
      'appium:noReset': true,
      'appium:app': undefined,
    });
    await assert.doesNotReject(initSession(localCaps));
  });

  it('should fail to start and stop a session if unknown bundle id used', async function () {
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': 'io.blahblahblah.blah',
      'appium:app': undefined,
    });
    await assert.rejects(initSession(localCaps));
  });

  it('should fail to start and stop a session if unknown bundle id used when no sim is running', async function () {
    await killAllSimulators();
    const localCaps = amendCapabilities(caps, {
      'appium:bundleId': 'io.blahblahblah.blah',
      'appium:app': undefined,
    });
    await assert.rejects(initSession(localCaps));
  });

  describe('WebdriverAgent port', function () {
    it('should run on default port if no other specified', async function () {
      const localCaps = amendCapabilities(baseCaps, {
        'appium:fullReset': true,
        'appium:useNewWDA': true,
        'appium:wdaLocalPort': undefined,
      });
      driver = await initSession(localCaps);
      await assert.doesNotReject(axios({url: `http://${HOST}:8100/status`}));
    });
    it('should run on port specified', async function () {
      const localCaps = amendCapabilities(baseCaps, {
        'appium:fullReset': true,
        'appium:useNewWDA': true,
        'appium:wdaLocalPort': 6000,
      });
      driver = await initSession(localCaps);
      await assert.rejects(axios({url: `http://${HOST}:8100/status`}), /ECONNREFUSED/);
      await assert.doesNotReject(axios({url: `http://${HOST}:8100/status`}));
    });
  });

  describe('initial orientation', function () {
    async function runOrientationTest(initialOrientation: string) {
      const localCaps = amendCapabilities(caps, {
        'appium:orientation': initialOrientation,
      });
      driver = await initSession(localCaps);

      assert.strictEqual(await driver.getOrientation(), initialOrientation);
    }

    for (const orientation of ['LANDSCAPE', 'PORTRAIT']) {
      it(`should be able to start in a ${orientation} mode`, async function () {
        await runOrientationTest(orientation);
      });
    }
  });

  describe('reset', function () {
    beforeEach(async function () {
      await deleteSession();

      await retryInterval(5, 1000, async () => {
        await killAllSimulators();
      });
    });

    it('default: creates sim and deletes it afterwards', async function () {
      const uiCatalogSimCaps = await getUICatalogSimCaps();
      const caps = amendCapabilities(uiCatalogSimCaps, {
        'appium:enforceFreshSimulatorCreation': true,
      });

      const simsBefore = await getNumSims();
      await initSession(caps);
      const simsDuring = await getNumSims();
      await deleteSession();
      const simsAfter = await getNumSims();

      assert.strictEqual(simsDuring, simsBefore + 1);
      assert.strictEqual(simsAfter, simsBefore);
    });

    it('with udid: uses sim and resets afterwards if resetOnSessionStartOnly is false', async function () {
      // before
      const udid = await createDevice();
      const sim = await getSimulator(udid, {
        platform: 'iOS',
        checkExistence: false,
      });
      await sim.run();

      try {
        // test
        const uiCatalogSimCaps = await getUICatalogSimCaps();
        const caps = amendCapabilities(uiCatalogSimCaps, {
          'appium:udid': udid,
          'appium:fullReset': true,
          'appium:resetOnSessionStartOnly': false,
        });

        assert.strictEqual(await sim.isRunning(), true);
        const simsBefore = await getNumSims();
        await initSession(caps);
        const simsDuring = await getNumSims();
        await deleteSession();
        const simsAfter = await getNumSims();
        assert.strictEqual(await sim.isRunning(), false);

        // make sure no new simulators were created during the test
        assert.strictEqual(simsDuring, simsBefore);
        assert.strictEqual(simsAfter, simsBefore);
      } finally {
        // cleanup
        await deleteDeviceWithRetry(udid);
      }
    });

    it('with udid booted: uses sim and leaves it afterwards', async function () {
      // before
      const udid = await createDevice();
      const sim = await getSimulator(udid, {
        platform: 'iOS',
        checkExistence: false,
      });
      await sim.run();

      try {
        await delay(2000);

        // test
        const uiCatalogSimCaps = await getUICatalogSimCaps();
        const caps = amendCapabilities(uiCatalogSimCaps, {
          'appium:udid': udid,
          'appium:noReset': true,
        });

        assert.strictEqual(await sim.isRunning(), true);
        const simsBefore = await getNumSims();
        await initSession(caps);
        const simsDuring = await getNumSims();
        await deleteSession();
        const simsAfter = await getNumSims();
        assert.strictEqual(await sim.isRunning(), true);

        assert.strictEqual(simsDuring, simsBefore);
        assert.strictEqual(simsAfter, simsBefore);
      } finally {
        await cleanupSimulator(sim);
      }
    });

    it('with invalid udid: throws an error', async function () {
      // test
      const uiCatalogSimCaps = await getUICatalogSimCaps();
      const caps = amendCapabilities(uiCatalogSimCaps, {
        'appium:udid': 'some-random-udid',
      });

      await assert.rejects(initSession(caps), (err: any) => err.message.includes('Unknown device or simulator UDID'));
    });

    it('with non-existent udid: throws an error', async function () {
      // test
      const udid = 'a77841db006fb1762fee0bb6a2477b2b3e1cfa7d';
      const uiCatalogSimCaps = await getUICatalogSimCaps();
      const caps = amendCapabilities(uiCatalogSimCaps, {'appium:udid': udid});

      await assert.rejects(initSession(caps), (err: any) => err.message.includes('Unknown device or simulator UDID'));
    });

    it('with noReset set to true: leaves sim booted', async function () {
      // before
      const udid = await createDevice();
      const sim = await getSimulator(udid, {
        platform: 'iOS',
        checkExistence: false,
      });

      try {
        // some systems require a pause before initializing.
        await delay(2000);

        // test
        const uiCatalogSimCaps = await getUICatalogSimCaps();
        const caps = amendCapabilities(uiCatalogSimCaps, {
          'appium:udid': udid,
          'appium:noReset': true,
        });

        const simsBefore = await getNumSims();
        await initSession(caps);
        const simsDuring = await getNumSims();
        await deleteSession();
        const simsAfter = await getNumSims();
        assert.strictEqual(await sim.isRunning(), true);

        assert.strictEqual(simsDuring, simsBefore);
        assert.strictEqual(simsAfter, simsBefore);
      } finally {
        await cleanupSimulator(sim);
      }
    });
  });
});
