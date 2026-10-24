import assert from 'node:assert/strict';
import {describe, it, before, beforeEach, afterEach} from 'node:test';

import {WATCHOS_CAPS, WATCHOS_DEVICE_NAME} from '../desired.js';
import {PREDICATE_SEARCH, CLASS_CHAIN_SEARCH} from '../helpers/element.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {getTargetDevice} from '../helpers/simulator.js';

const WATCH_APP_ID = 'com.apple.NanoSettings';

/**
 * watchOS sessions here drive `com.apple.NanoSettings`, the watch application shipped with the
 * Simulator, so these tests cover the driver and the agent CI installs rather than an app of ours.
 *
 * Only behaviour that holds against *upstream's* published WebDriverAgent belongs in this file: the
 * CI job downloads a prebuilt watchOS agent release asset (`functional-test.yml` runs
 * `appium driver run xcuitest download-wda --platform=watchOS`) rather than building a branch, so a
 * test gated on an unpublished agent build would fail the whole matrix. Behaviours that need a newer
 * agent - refusing a `mobile: swipe` `velocity`, dismissing the keyboard through the watch accessory
 * bar, and answering `no such alert` instead of an empty alert body for the permanent childless
 * `XCUIElementTypeAlert` watchOS keeps in the system application - are covered by the agent's own
 * integration suite and by the repeatable scripts described in the plan document.
 */
describe('watchOS', function () {
  let baseCaps: Record<string, any>;
  let udid: string;

  before(async function () {
    udid = await getTargetDevice(WATCHOS_DEVICE_NAME);
  });

  beforeEach(function () {
    baseCaps = {...WATCHOS_CAPS, udid};
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.NanoSettings', async function () {
    const driver = await initSession(baseCaps);
    assert.ok(await driver.$('~General'));
  });

  it('should report the watch application as active', async function () {
    const driver = await initSession(baseCaps);
    // wdio types `execute` as resolving to an element reference; this command answers an object.
    const activeAppInfo = (await driver.execute('mobile: activeAppInfo')) as unknown as {
      bundleId: string;
      pid: number;
    };
    assert.equal(activeAppInfo.bundleId, WATCH_APP_ID);
    assert.ok(activeAppInfo.pid > 0, `expected a live pid, got ${activeAppInfo.pid}`);
  });

  it('should expose the accessibility hierarchy and element metrics', async function () {
    const driver = await initSession(baseCaps);

    const source = await driver.getPageSource();
    assert.match(source, /XCUIElementTypeApplication/);
    assert.match(source, /General/);

    const element = await driver.$('~General');
    assert.ok(await element.isExisting());
    assert.ok(await element.isDisplayed());
    assert.equal(await element.getText(), 'General');
    // NanoSettings renders its labels as StaticText, not Button.
    assert.equal(await element.getTagName(), 'XCUIElementTypeStaticText');

    const size = await element.getSize();
    assert.ok(size.width > 0 && size.height > 0, `unexpected size ${JSON.stringify(size)}`);
    const location = await element.getLocation();
    assert.ok(Number.isFinite(location.x) && Number.isFinite(location.y));

    const rect = await driver.getWindowRect();
    assert.ok(rect.width > 0 && rect.height > 0, `unexpected window ${JSON.stringify(rect)}`);

    assert.ok((await driver.takeScreenshot()).length > 100);
  });

  it('should find the same element with every supported locator strategy', async function () {
    const driver = await initSession(baseCaps);
    const tagName = await (await driver.$('~General')).getTagName();

    assert.ok(await (await driver.$(`class name:${tagName}`)).isExisting());
    assert.ok(await (await driver.$(`${CLASS_CHAIN_SEARCH}:**/${tagName}[\`name == 'General'\`]`)).isExisting());
    assert.ok(await (await driver.$(`${PREDICATE_SEARCH}:name == 'General' AND type == '${tagName}'`)).isExisting());
    assert.ok(
      await (await driver.$(`xpath://${tagName}[@name='General']`)).isExisting(),
      'xpath should locate the label',
    );
  });

  it('should rotate the Digital Crown and press the home button', async function () {
    const driver = await initSession(baseCaps);
    await driver.execute('mobile: rotateDigitalCrown', {delta: 5});
    await driver.execute('mobile: rotateDigitalCrown', {delta: -5});
    await driver.execute('mobile: pressButton', {name: 'home'});
    // The session and its runner must still serve requests after the hardware commands.
    assert.match(await driver.getPageSource(), /XCUIElementTypeApplication/);
  });

  it('should reject unsupported capabilities naming the platform and the reason', async function () {
    const driver = await initSession(baseCaps);
    const commands: [string, () => Promise<unknown>][] = [
      ['mobile: keys', () => driver.execute('mobile: keys', {keys: ['a']})],
      ['mobile: setClipboard', () => driver.execute('mobile: setClipboard', {content: 'aGk=', encoding: 'base64'})],
      ['mobile: pinch', () => driver.execute('mobile: pinch', {scale: 1.5, velocity: 2})],
      ['mobile: forcePress', () => driver.execute('mobile: forcePress', {duration: 0.5})],
      ['mobile: deepLink', () => driver.execute('mobile: deepLink', {url: 'https://appium.io'})],
      ['orientation', () => driver.getOrientation()],
      ['orientation', () => driver.setOrientation('LANDSCAPE')],
    ];
    for (const [label, call] of commands) {
      await assert.rejects(
        call,
        (err: Error) => {
          assert.match(err.message, /not supported on watchOS/);
          return true;
        },
        `${label} should be rejected naming watchOS and the reason`,
      );
    }
  });

  it('should keep application lifecycle commands working', async function () {
    const driver = await initSession(baseCaps);
    // wdio types `execute` as resolving to an element reference; this command answers a number.
    const appState = async () =>
      (await driver.execute('mobile: queryAppState', {bundleId: WATCH_APP_ID})) as unknown as number;

    assert.equal(await driver.isAppInstalled(WATCH_APP_ID), true);
    assert.equal(await appState(), 4); // 4 == running in the foreground

    await driver.execute('mobile: terminateApp', {bundleId: WATCH_APP_ID});
    assert.equal(await appState(), 1); // 1 == not running

    await driver.execute('mobile: activateApp', {bundleId: WATCH_APP_ID});
    await driver.waitUntil(async () => (await appState()) === 4, {
      timeoutMsg: 'the watch application never returned to the foreground',
    });
  });

  it('should report stale elements after the application is terminated', async function () {
    const driver = await initSession(baseCaps);
    const element = await driver.$('~General');
    assert.ok(await element.isDisplayed());

    await driver.execute('mobile: terminateApp', {bundleId: WATCH_APP_ID});
    // A handle held across termination must be reported gone rather than answered with data from a
    // relaunched application, and must not time out.
    await assert.rejects(
      () => element.getText(),
      (err: Error) => {
        assert.match(err.message, /not present in the current view anymore/);
        return true;
      },
      'a reference held across termination should be reported stale',
    );

    await driver.execute('mobile: activateApp', {bundleId: WATCH_APP_ID});
    assert.ok(await (await driver.$('~General')).isDisplayed());
  });
});
