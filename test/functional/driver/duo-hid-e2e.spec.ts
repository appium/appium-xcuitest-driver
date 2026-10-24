import assert from 'node:assert/strict';
import {it} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {getSimulator} from 'appium-ios-simulator';

import {XCUITestDriver} from '../../../lib/driver.js';

// Opt-in host/WDA integration. Supply a booted Duo, an already running WDA,
// and an installed test app supporting both portrait and landscape orientations.
const {DUO_UDID, DUO_TEST_BUNDLE_ID, DUO_WDA_URL} = process.env;
it(
  'host HID controls across closed, book and open Duo poses',
  {
    skip: !DUO_UDID || !DUO_TEST_BUNDLE_ID || !DUO_WDA_URL,
    timeout: 180000,
  },
  async () => {
    const driver = new XCUITestDriver({} as any);
    const simulator = await getSimulator(DUO_UDID!);
    Object.defineProperty(driver, 'device', {get: () => simulator});
    driver.opts.platformName = 'iOS';
    async function request(path: string, method = 'GET', data?: unknown): Promise<any> {
      const response = await fetch(`${DUO_WDA_URL}${path}`, {
        method,
        headers: {'Content-Type': 'application/json'},
        ...(method === 'GET' || data === undefined ? {} : {body: JSON.stringify(data)}),
        signal: AbortSignal.timeout(20000),
      });
      const body = (await response.json()) as any;
      assert.ok(response.ok && !body.value?.error, JSON.stringify(body.value));
      return body;
    }
    const {sessionId} = await request('/session', 'POST', {
      capabilities: {
        alwaysMatch: {
          bundleId: DUO_TEST_BUNDLE_ID,
          shouldWaitForQuiescence: false,
        },
      },
    });
    driver.proxyCommand = (async (path: string, method: string, data?: unknown) =>
      (await request(`/session/${sessionId}${path}`, method, data)).value) as typeof driver.proxyCommand;
    const originalAngle = await driver.mobileGetSimulatedHingeAngle();
    const originalDeviceOrientation = await driver.proxyCommand('/wda/deviceOrientation', 'GET');
    async function waitFor(check: () => Promise<boolean>): Promise<void> {
      const until = Date.now() + 5000;
      do {
        if (await check()) {
          return;
        }
        await delay(100);
      } while (Date.now() < until);
      assert.fail('Simulator state did not converge');
    }
    try {
      for (const angle of [0, 90, 180]) {
        await driver.mobileSetSimulatedHingeAngle(angle);
        await waitFor(async () => Math.abs((await driver.mobileGetSimulatedHingeAngle()) - angle) < 1);
        const display = (await driver.mobileListDisplays()).find(({isDefault}) =>
          angle === 0 ? isDefault : !isDefault,
        );
        assert.ok(display);
        await driver.proxyCommand('/appium/settings', 'POST', {
          settings: {currentDisplayId: display.id, defaultActiveApplication: DUO_TEST_BUNDLE_ID},
        });
        const currentSettings = driver.settings.getSettings();
        driver.settings.getSettings = () => ({...currentSettings, currentDisplayId: display.id});
        await driver.proxyCommand('/wda/apps/activate', 'POST', {bundleId: DUO_TEST_BUNDLE_ID});
        await waitFor(
          async () =>
            Number(await driver.proxyCommand('/wda/apps/state', 'POST', {bundleId: DUO_TEST_BUNDLE_ID})) === 4,
        );
        for (const orientation of ['LANDSCAPE', 'PORTRAIT']) {
          await driver.setOrientation(orientation);
          assert.equal(await driver.proxyCommand('/orientation', 'GET'), orientation);
        }
        for (const z of [90, 270]) {
          await driver.setRotation(0, 0, z);
          assert.deepEqual(await driver.proxyCommand('/rotation', 'GET'), {x: 0, y: 0, z});
        }
        assert.equal(await driver.proxyCommand('/wda/deviceOrientation', 'GET'), originalDeviceOrientation);
        await driver.mobilePressButton('home');
        await waitFor(
          async () => Number(await driver.proxyCommand('/wda/apps/state', 'POST', {bundleId: DUO_TEST_BUNDLE_ID})) < 4,
        );
        await driver.lock();
        assert.equal(await driver.isLocked(), true);
        await driver.unlock();
        assert.equal(await driver.isLocked(), false);
      }
    } finally {
      try {
        if (await driver.isLocked()) {
          await driver.unlock();
        }
        await driver.mobileSetSimulatedHingeAngle(originalAngle);
        await waitFor(async () => Math.abs((await driver.mobileGetSimulatedHingeAngle()) - originalAngle) < 1);
      } finally {
        await request(`/session/${sessionId}`, 'DELETE');
      }
    }
  },
);
