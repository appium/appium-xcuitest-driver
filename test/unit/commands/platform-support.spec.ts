import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import type {ActionSequence} from '@appium/types';
import {errors} from 'appium/driver.js';
import sinon from 'sinon';

import type {Direction} from '../../../lib/commands/types.js';
import {startWdaSession} from '../../../lib/commands/wda/startup.js';
import {RemoteXPCFacade} from '../../../lib/device/remote-xpc/facade.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';
import {XCUITestDriver} from '../../../lib/driver.js';

const WATCH = 'watchOS';
const IOS = 'iOS';

const ACTION_SEQUENCE: ActionSequence[] = [
  {
    type: 'pointer',
    id: 'finger1',
    parameters: {pointerType: 'touch'},
    actions: [{type: 'pointerDown', button: 0}],
  },
];

/** The private session-startup helper, exposed for the orientation capability test. */
type OrientationStartupHost = {
  setInitialOrientation(orientation: string): Promise<void>;
};

/**
 * Creates a driver whose session looks like the given platform.
 */
function makeDriver(platformName: string): XCUITestDriver {
  const driver = new XCUITestDriver({} as XCUITestDriverOpts);
  driver.opts.platformName = platformName;
  return driver;
}

describe('platform support gates', function () {
  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });
  afterEach(function () {
    sandbox.restore();
  });

  /**
   * Runs the session-creation request for `platformName` and returns the capabilities the driver
   * handed to WebDriverAgent.
   */
  async function captureWdaSessionCaps(
    platformName: string,
    opts: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const driver = makeDriver(platformName);
    Object.assign(driver.opts, opts);
    const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
    await startWdaSession.call(driver, 'com.test.app');
    sinon.assert.calledWith(proxy, '/session', 'POST');
    const body = proxy.firstCall.args[2] as {capabilities: {firstMatch: [Record<string, unknown>]}};
    return body.capabilities.firstMatch[0];
  }

  /**
   * Asserts that `command` is rejected on watchOS with a NotImplementedError naming the
   * command, the platform and the reason, and that WebDriverAgent is never asked.
   */
  async function assertRejectedOnWatch(
    command: (driver: XCUITestDriver) => Promise<unknown>,
    expectedMessage: RegExp,
  ): Promise<void> {
    const driver = makeDriver(WATCH);
    const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
    await assert.rejects(command(driver), (err: unknown) => {
      assert.ok(err instanceof errors.NotImplementedError, `expected NotImplementedError, got ${String(err)}`);
      assert.match(err.message, expectedMessage);
      return true;
    });
    sinon.assert.notCalled(proxy);
  }

  /**
   * Asserts that the same command still reaches the given WebDriverAgent endpoint on iOS.
   */
  async function assertProxiedOnIos(
    command: (driver: XCUITestDriver) => Promise<unknown>,
    endpoint: string,
  ): Promise<void> {
    const driver = makeDriver(IOS);
    const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
    await command(driver);
    sinon.assert.calledWith(proxy, endpoint);
  }

  /**
   * Asserts that a command a platform does support still reaches the given WebDriverAgent
   * endpoint, so gating regressions surface as a missing call rather than a passing stub.
   */
  async function assertProxiedOnPlatform(
    platformName: string,
    command: (driver: XCUITestDriver) => Promise<unknown>,
    endpoint: string,
  ): Promise<void> {
    const driver = makeDriver(platformName);
    sandbox.stub(driver, 'isWebContext').returns(false);
    const proxy = sandbox.stub(driver, 'proxyCommand').resolves([]);
    await command(driver);
    sinon.assert.calledWith(proxy, endpoint);
  }

  describe('mobile: batteryInfo', function () {
    it('should be rejected on watchOS with an agent older than the watch battery route', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.17.3'}};
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(driver.mobileGetBatteryInfo(), (err: unknown) => {
        assert.ok(err instanceof errors.NotImplementedError, `expected NotImplementedError, got ${String(err)}`);
        assert.match(
          err.message,
          /^Battery info is not supported on watchOS: battery info needs a watchOS WebDriverAgent build that reads it through WatchKit, which versions older than 16\.19\.2 do not contain; upgrade the appium-webdriveragent package to its latest release, which is 16\.19\.2 or newer$/,
        );
        return true;
      });
      sinon.assert.notCalled(proxy);
    });

    it('should be rejected on watchOS when the agent reports no version', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileGetBatteryInfo(),
        /^Battery info is not supported on watchOS: battery info needs a watchOS WebDriverAgent build/,
      );
    });

    it('should be proxied on watchOS once the agent is new enough', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.19.2'}};
      const facade = sandbox.createStubInstance(RemoteXPCFacade);
      facade.determineAvailability.resolves(false);
      sandbox.stub(driver, 'remoteXPCFacade').get(() => facade);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({level: -1, state: 0});
      assert.deepEqual(await driver.mobileGetBatteryInfo(), {level: -1, state: 0, advanced: {}});
      sinon.assert.calledWith(proxy, '/wda/batteryInfo', 'GET');
    });

    // A pre-release of the floor build ships *before* the release that adds the route, so it must
    // not clear the floor; a pre-release of a *later* release must still clear it, otherwise the
    // comparison would simply reject every pre-release. A version that is not valid semver at all
    // still falls back to coercion, so a `v`-prefixed build number is understood.
    it('should reject a pre-release of the version that adds the route', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.19.2-beta.4'}};
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(driver.mobileGetBatteryInfo(), /versions older than 16\.19\.2 do not contain/);
      sinon.assert.notCalled(proxy);
    });

    it('should accept a pre-release of a newer version', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.20.0-beta.1'}};
      const facade = sandbox.createStubInstance(RemoteXPCFacade);
      facade.determineAvailability.resolves(false);
      sandbox.stub(driver, 'remoteXPCFacade').get(() => facade);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({level: -1, state: 0});
      await driver.mobileGetBatteryInfo();
      sinon.assert.calledWith(proxy, '/wda/batteryInfo', 'GET');
    });

    it('should understand a version that is not valid semver', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: 'v16.19.2'}};
      const facade = sandbox.createStubInstance(RemoteXPCFacade);
      facade.determineAvailability.resolves(false);
      sandbox.stub(driver, 'remoteXPCFacade').get(() => facade);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({level: -1, state: 0});
      await driver.mobileGetBatteryInfo();
      sinon.assert.calledWith(proxy, '/wda/batteryInfo', 'GET');
    });

    it('should still read the agent on iOS', async function () {
      const driver = makeDriver(IOS);
      const facade = sandbox.createStubInstance(RemoteXPCFacade);
      facade.determineAvailability.resolves(false);
      sandbox.stub(driver, 'remoteXPCFacade').get(() => facade);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({level: 100, state: 2});
      assert.deepEqual(await driver.mobileGetBatteryInfo(), {level: 100, state: 2, advanced: {}});
      sinon.assert.calledWith(proxy, '/wda/batteryInfo', 'GET');
    });
  });

  describe('orientation', function () {
    it('should reject reading the orientation on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.getOrientation(),
        /^Getting the device orientation is not supported on watchOS: the watchOS Simulator does not support app or device orientation/,
      );
    });

    it('should reject setting the orientation on watchOS and name the alternative', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.setOrientation('LANDSCAPE'),
        /^Setting the device orientation is not supported on watchOS: the watchOS Simulator does not support app or device orientation, so the orientation endpoint is absent from the watchOS WebDriverAgent build; rotate the watch Simulator window in the Simulator UI \('Device > Rotate Digital Crown'\) if a different layout is needed$/,
      );
    });

    it('should still proxy on iOS', async function () {
      const driver = makeDriver(IOS);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves('PORTRAIT');
      assert.equal(await driver.getOrientation(), 'PORTRAIT');
      sinon.assert.calledWith(proxy, '/orientation', 'GET');
      await driver.setOrientation('landscape');
      sinon.assert.calledWith(proxy, '/orientation', 'POST', {orientation: 'LANDSCAPE'});
    });

    it('should reject an unknown orientation on iOS', async function () {
      const driver = makeDriver(IOS);
      sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(driver.setOrientation('UPSIDE_DOWN'), /The 'UPSIDE_DOWN' orientation is unknown/);
    });

    it('should hand the orientation routes to the driver on watchOS', function () {
      const driver = makeDriver(WATCH);
      assert.equal(driver.proxyRouteIsAvoided('fake-session', 'GET', '/session/fake-session/orientation'), true);
      assert.equal(driver.proxyRouteIsAvoided('fake-session', 'POST', '/session/fake-session/orientation'), true);
    });

    it('should keep proxying the orientation routes on iOS', function () {
      const driver = makeDriver(IOS);
      assert.equal(driver.proxyRouteIsAvoided('fake-session', 'GET', '/session/fake-session/orientation'), false);
      assert.equal(driver.proxyRouteIsAvoided('fake-session', 'POST', '/session/fake-session/orientation'), false);
    });

    it('should ignore the orientation cap on watchOS without touching the agent', async function () {
      const driver = makeDriver(WATCH);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      const warn = sandbox.spy(driver.log, 'warn');
      await (driver as unknown as OrientationStartupHost).setInitialOrientation('LANDSCAPE');
      sinon.assert.notCalled(proxy);
      sinon.assert.calledOnce(warn);
      assert.match(String(warn.firstCall.args.join(' ')), /Setting the device orientation is not supported on watchOS/);
    });

    it('should still apply the orientation cap on iOS', async function () {
      const driver = makeDriver(IOS);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await (driver as unknown as OrientationStartupHost).setInitialOrientation('LANDSCAPE');
      sinon.assert.calledWith(proxy, '/orientation', 'POST', {orientation: 'LANDSCAPE'});
    });
  });

  describe('mobile: listDisplays', function () {
    it('should proxy on both platforms', async function () {
      await assertProxiedOnPlatform(IOS, (driver) => driver.mobileListDisplays(), '/wda/screens');
      await assertProxiedOnPlatform(WATCH, (driver) => driver.mobileListDisplays(), '/wda/screens');
    });
  });

  describe('mobile: performAccessibilityAudit', function () {
    it('should proxy on both platforms', async function () {
      await assertProxiedOnIos((driver) => driver.mobilePerformAccessibilityAudit(), '/wda/performAccessibilityAudit');
      await assertProxiedOnPlatform(
        WATCH,
        (driver) => driver.mobilePerformAccessibilityAudit(),
        '/wda/performAccessibilityAudit',
      );
    });
  });

  describe('mobile: siriCommand', function () {
    // Verified on watchOS 26.5: the route is registered in the watchOS agent build and Siri
    // answers, so it must not be gated.
    it('should proxy on both platforms', async function () {
      await assertProxiedOnPlatform(
        WATCH,
        (driver) => driver.mobileSiriCommand('what time is it'),
        '/wda/siri/activate',
      );
      await assertProxiedOnIos((driver) => driver.mobileSiriCommand('what time is it'), '/wda/siri/activate');
    });

    it('should still validate arguments', async function () {
      const driver = makeDriver(WATCH);
      await assert.rejects(driver.mobileSiriCommand(''), /"text" argument is mandatory/);
    });
  });

  describe('clipboard and pasteboard', function () {
    it('should reject every clipboard mode on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.setClipboard('aGk=', 'plaintext'),
        /^Clipboard access via WebDriverAgent \('mobile: setClipboard' without mode: 'xpc'\) is not supported on watchOS/,
      );
      await assertRejectedOnWatch(
        (driver) => driver.getClipboard('plaintext'),
        /^Clipboard access via WebDriverAgent \('mobile: getClipboard' without mode: 'xpc'\) is not supported on watchOS/,
      );
    });

    it('should keep rejecting the xpc mode for real devices only', async function () {
      const driver = makeDriver(WATCH);
      sandbox.stub(driver, 'isRealDevice').returns(false);
      await assert.rejects(
        driver.setClipboard('aGk=', undefined, 'xpc'),
        /Setting clipboard content can only be performed on a real device/,
      );
    });

    it('should still proxy the clipboard on iOS', async function () {
      await assertProxiedOnIos((driver) => driver.setClipboard('aGk='), '/wda/setPasteboard');
      await assertProxiedOnIos((driver) => driver.getClipboard(), '/wda/getPasteboard');
    });

    it('should not point at the Simulator pasteboard as an alternative', async function () {
      // 'mobile: setPasteboard' used to be advertised as the watchOS alternative, but the watchOS
      // Simulator runtime refuses that pasteboard connection too.
      const driver = makeDriver(WATCH);
      await assert.rejects(driver.setClipboard('aGk=', 'plaintext'), (err: unknown) => {
        assert.ok(err instanceof errors.NotImplementedError);
        assert.match((err as Error).message, /Simulator-side pasteboard commands are unavailable there too/);
        assert.doesNotMatch((err as Error).message, /use 'mobile: setPasteboard'/);
        return true;
      });
    });

    it('should reject the Simulator pasteboard commands on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileSetPasteboard('hi'),
        /^mobile: setPasteboard is not supported on watchOS: the watchOS Simulator runtime does not expose its pasteboard/,
      );
      await assertRejectedOnWatch(
        (driver) => driver.mobileGetPasteboard(),
        /^mobile: getPasteboard is not supported on watchOS: the watchOS Simulator runtime does not expose its pasteboard/,
      );
    });
  });

  describe('text entry', function () {
    // Measured on watchOS 26.5: W3C key actions and taps on the on-screen keys both land text,
    // while `POST /element/:id/value`, its bulk form and the deprecated `POST /session/:id/keys`
    // answer 200 without entering anything. So only the named-key route may be gated.
    it('should reject mobile: keys on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileKeys(['a']),
        /^mobile: keys is not supported on watchOS: the named-key keyboard endpoint is absent/,
      );
    });

    it('should suggest the text-entry routes that do work', async function () {
      const driver = makeDriver(WATCH);
      sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(driver.mobileKeys(['a']), /W3C key actions.*XCUIElementTypeKey elements.*label/s);
    });

    it('should still proxy mobile: keys on iOS', async function () {
      await assertProxiedOnIos((driver) => driver.mobileKeys(['a']), '/wda/element/0/keyboardInput');
    });

    it('should reject keyboard dismissal on watchOS with an agent older than the accessory-bar fix', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.17.4'}};
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(driver.mobileHideKeyboard(), (err: unknown) => {
        assert.ok(err instanceof errors.NotImplementedError, `expected NotImplementedError, got ${String(err)}`);
        assert.match(
          err.message,
          /^mobile: hideKeyboard is not supported on watchOS: keyboard dismissal needs a watchOS WebDriverAgent build whose search for the accessory bar is scoped to the keyboard-owning process, which versions older than 16\.19\.2 do not; upgrade the appium-webdriveragent package to its latest release, which is 16\.19\.2 or newer, or tap the 'Done' button of the keyboard's accessory bar directly$/,
        );
        return true;
      });
      sinon.assert.notCalled(proxy);
    });

    // The builds this work passed through on the way here search the whole application tree, which
    // can land on the application's own `Done` button instead of the keyboard's. None of them was
    // ever published, but they are reachable by building from source, so the floor must exclude them.
    for (const version of ['16.19.0', '16.19.1']) {
      it(`should reject keyboard dismissal on watchOS with agent ${version}`, async function () {
        const driver = makeDriver(WATCH);
        driver.cachedWdaStatus = {build: {version}};
        const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
        await assert.rejects(driver.mobileHideKeyboard(), errors.NotImplementedError);
        sinon.assert.notCalled(proxy);
      });
    }

    // The control that closes the watch keyboard is `Done`, not the iOS keyboard's `done`.
    it('should ask for both key spellings on watchOS', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.19.2'}};
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves(true);
      await driver.mobileHideKeyboard();
      sinon.assert.calledWith(proxy, '/wda/keyboard/dismiss', 'POST', {keyNames: ['done', 'Done']});
    });

    it('should keep caller-supplied key names first on watchOS', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.19.2'}};
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves(true);
      await driver.mobileHideKeyboard(['Cancel']);
      sinon.assert.calledWith(proxy, '/wda/keyboard/dismiss', 'POST', {keyNames: ['Cancel', 'done', 'Done']});
    });

    it('should not widen the default key names on iOS', async function () {
      const driver = makeDriver(IOS);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves(true);
      await driver.mobileHideKeyboard();
      sinon.assert.calledWith(proxy, '/wda/keyboard/dismiss', 'POST', {keyNames: ['done']});
    });
  });

  describe('deep links', function () {
    it('should reject mobile: deepLink and URL navigation on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileDeepLink('myapp://x'),
        /^mobile: deepLink is not supported on watchOS: the watchOS Simulator cannot open URLs/,
      );
      const driver = makeDriver(WATCH);
      sandbox.stub(driver, 'isWebContext').returns(false);
      sandbox.stub(driver, 'isRealDevice').returns(false);
      sandbox.stub(driver, 'setCurrentUrl');
      await assert.rejects(
        driver.setUrl('https://apple.com'),
        (err: unknown) =>
          err instanceof errors.NotImplementedError && /Opening a URL is not supported on watchOS/.test(err.message),
      );
    });

    it('should still proxy deep links on iOS', async function () {
      await assertProxiedOnIos((driver) => driver.mobileDeepLink('myapp://x'), '/url');
    });
  });

  describe('Simulator UI settings', function () {
    it('should reject text size and contrast on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileSetContentSize('large'),
        /^mobile: setContentSize is not supported on watchOS: the watchOS Simulator runtime refuses text-size/,
      );
      await assertRejectedOnWatch(
        (driver) => driver.mobileSetIncreaseContrast('enabled'),
        /^mobile: setIncreaseContrast is not supported on watchOS/,
      );
    });

    it('should still validate arguments before the platform gate', async function () {
      const driver = makeDriver(WATCH);
      await assert.rejects(driver.mobileSetContentSize('huge' as never), /'size' value is expected to be one of/);
      await assert.rejects(driver.mobileSetIncreaseContrast('maybe' as never), /'increaseContrast' value/);
    });
  });

  describe('W3C actions', function () {
    // watchOS synthesizes W3C actions; verified end-to-end on watchOS 26.5 by tapping an element
    // with a pointer sequence and observing its action fire. The route string is present in older
    // watch agent builds, but the category answering it is not, so those builds must be refused by
    // the driver - see the `gestureSynthesis` entry of the support matrix.
    it('should proxy the actions route on iOS', async function () {
      const driver = makeDriver(IOS);
      sandbox.stub(driver, 'isWebContext').returns(false);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await driver.performActions(ACTION_SEQUENCE);
      sinon.assert.calledWith(proxy, '/actions', 'POST', {actions: ACTION_SEQUENCE});
    });

    it('should reject W3C actions on watchOS with an agent older than the synthesis fix', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.17.4'}};
      sandbox.stub(driver, 'isWebContext').returns(false);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(driver.performActions(ACTION_SEQUENCE), (err: unknown) => {
        assert.ok(err instanceof errors.NotImplementedError, `expected NotImplementedError, got ${String(err)}`);
        assert.match(
          err.message,
          /^W3C actions is not supported on watchOS: synthesized gestures need a watchOS WebDriverAgent build whose event builders no longer need UIKit's UIInterfaceOrientation, which versions older than 16\.19\.2 do not contain; upgrade the appium-webdriveragent package to its latest release, which is 16\.19\.2 or newer, or use POST \/element\/:uuid\/click, which every watchOS build serves$/,
        );
        return true;
      });
      sinon.assert.notCalled(proxy);
    });

    it('should proxy the actions route on watchOS once the agent is new enough', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.19.2'}};
      sandbox.stub(driver, 'isWebContext').returns(false);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await driver.performActions(ACTION_SEQUENCE);
      sinon.assert.calledWith(proxy, '/actions', 'POST', {actions: ACTION_SEQUENCE});
    });

    // The web-element check is an input problem, so it is answered before the platform gate: the
    // caller has to be told to switch context, not that watchOS cannot synthesize gestures.
    it('should reject web element origins on watchOS before the synthesis gate', async function () {
      const driver = makeDriver(WATCH);
      driver.cachedWdaStatus = {build: {version: '16.17.4'}};
      sandbox.stub(driver, 'isWebContext').returns(false);
      driver.webElementsCache.set('0', {});
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      const actions = [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: {pointerType: 'touch'},
          actions: [{type: 'pointerMove', x: 0, y: 0, origin: {ELEMENT: '0'}}],
        },
      ] as unknown as ActionSequence[];
      await assert.rejects(driver.performActions(actions), (err: unknown) => {
        assert.ok(err instanceof errors.InvalidArgumentError, `expected InvalidArgumentError, got ${String(err)}`);
        assert.match(err.message, /contains one or more web elements/);
        return true;
      });
      sinon.assert.notCalled(proxy);
    });
  });

  describe('multi-touch and force gestures', function () {
    it('should reject pinch on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobilePinch(0.5, 1.1),
        /^Pinch gesture is not supported on watchOS: watchOS devices have a single-touch display/,
      );
    });

    it('should reject element rotation on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileRotateElement(Math.PI / 2, Math.PI / 4),
        /^Element rotation gesture is not supported on watchOS: watchOS devices have a single-touch display/,
      );
    });

    it('should reject force press on watchOS', async function () {
      await assertRejectedOnWatch(
        (driver) => driver.mobileForcePress(10, 10, 1, 1),
        /^Force press is not supported on watchOS: watchOS displays have no force sensor; use 'mobile: touchAndHold' for a long press$/,
      );
    });

    it('should still proxy on iOS', async function () {
      await assertProxiedOnIos((driver) => driver.mobilePinch(0.5, 1.1), '/wda/pinch');
      await assertProxiedOnIos((driver) => driver.mobileRotateElement(Math.PI / 2, Math.PI / 4), '/wda/rotate');
      await assertProxiedOnIos((driver) => driver.mobileForcePress(10, 10, 1, 1), '/wda/forceTouch');
    });

    // A malformed argument is malformed on every platform, so the gate must not be able to mask it:
    // on iOS these same calls answer `invalid argument`, and watchOS has to agree.
    it('should still validate gesture arguments before the platform gate', async function () {
      const driver = makeDriver(WATCH);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await assert.rejects(
        driver.mobileTouchAndHold('abc' as never, 10, 10),
        /"duration" parameter should be a valid number/,
      );
      await assert.rejects(driver.mobilePinch('abc' as never, 1.1), /"scale" parameter should be a valid number/);
      await assert.rejects(
        driver.mobileRotateElement('abc' as never, 1.1),
        /"rotation" parameter should be a valid number/,
      );
      // Both drag shapes are validated before the gate as well, not just the numeric arguments:
      // the shape errors are plain input errors on iOS too.
      await assert.rejects(driver.mobileDragFromToWithVelocity(1, 1, 100, '0'), /"toElementId" parameter is mandatory/);
      await assert.rejects(
        driver.mobileDragFromToWithVelocity(1, 1, 100),
        /fromX, fromY, toX, and toY must all be provided/,
      );
      sinon.assert.notCalled(proxy);
    });
  });

  describe('supported watchOS gestures', function () {
    const direction: Direction = 'up';
    const cases: [string, (driver: XCUITestDriver) => Promise<unknown>, string][] = [
      ['mobile: swipe', (driver) => driver.mobileSwipe(direction), '/wda/swipe'],
      ['mobile: tap', (driver) => driver.mobileTap(10, 10), '/wda/tap'],
      ['mobile: doubleTap', (driver) => driver.mobileDoubleTap(undefined, 10, 10), '/wda/doubleTap'],
      ['mobile: twoFingerTap', (driver) => driver.mobileTwoFingerTap(), '/wda/twoFingerTap'],
      ['mobile: touchAndHold', (driver) => driver.mobileTouchAndHold(1, 10, 10), '/wda/touchAndHold'],
      ['mobile: scroll', (driver) => driver.mobileScroll(undefined, direction), '/wda/scroll'],
      ['mobile: scrollToElement', (driver) => driver.mobileScrollToElement('0'), '/wda/element/0/scrollTo'],
      [
        'mobile: dragFromToForDuration',
        (driver) => driver.mobileDragFromToForDuration(1, 1, 1, 2, 2),
        '/wda/dragfromtoforduration',
      ],
      [
        'mobile: dragFromToWithVelocity',
        (driver) => driver.mobileDragFromToWithVelocity(1, 1, 100, undefined, undefined, 1, 1, 2, 2),
        '/wda/pressAndDragWithVelocity',
      ],
      ['mobile: tapWithNumberOfTaps', (driver) => driver.mobileTapWithNumberOfTaps(), '/wda/tapWithNumberOfTaps'],
    ];

    // Only the agent build that carries the watch targets registers the gestures above, so each
    // case is checked both ways: refused with the newest published build, proxied with a build that
    // has them. Refusing them against a capable agent would break the platform for nobody's benefit.
    for (const [name, command, endpoint] of cases) {
      it(`${name} should be proxied on watchOS with an agent that registers it`, async function () {
        const driver = makeDriver(WATCH);
        driver.cachedWdaStatus = {build: {version: '16.19.2'}};
        const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
        await command(driver);
        sinon.assert.calledWith(proxy, endpoint);
      });

      it(`${name} should be rejected on watchOS with an agent that omits the route`, async function () {
        const driver = makeDriver(WATCH);
        driver.cachedWdaStatus = {build: {version: '16.17.4'}};
        const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
        await assert.rejects(command(driver), (err: unknown) => {
          assert.ok(err instanceof errors.NotImplementedError, `expected NotImplementedError, got ${String(err)}`);
          assert.match(
            err.message,
            new RegExp(
              `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is not supported on watchOS: synthesized gestures`,
            ),
          );
          return true;
        });
        sinon.assert.notCalled(proxy);
      });

      it(`${name} should stay ungated on iOS`, async function () {
        await assertProxiedOnIos(command, endpoint);
      });
    }

    // No agent version can serve the picker wheel: the XCTest category behind it is iOS-only, so the
    // gate must not be version-qualified the way the gesture family above is.
    it('should reject mobile: selectPickerWheelValue on watchOS whatever the agent version', async function () {
      for (const version of ['16.17.4', '16.19.2']) {
        const driver = makeDriver(WATCH);
        driver.cachedWdaStatus = {build: {version}};
        const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
        await assert.rejects(driver.mobileSelectPickerWheelValue('0', 'next'), (err: unknown) => {
          assert.ok(err instanceof errors.NotImplementedError, `expected NotImplementedError, got ${String(err)}`);
          assert.match(
            err.message,
            /^mobile: selectPickerWheelValue is not supported on watchOS: watchOS has no picker-wheel API/,
          );
          return true;
        });
        sinon.assert.notCalled(proxy);
      }
    });

    it('should still proxy the picker wheel on iOS', async function () {
      await assertProxiedOnIos(
        (driver) => driver.mobileSelectPickerWheelValue('0', 'next'),
        '/wda/pickerwheel/0/select',
      );
    });

    // The velocity-carrying swipe stalls inside event synthesis on watchOS and takes the runner down,
    // which ends the session; the driver refuses the argument itself so that no agent build, old or
    // new, can be asked to attempt it. Every other velocity-carrying gesture is unaffected.
    it('should reject a swipe velocity on watchOS whatever the agent version', async function () {
      for (const version of ['16.17.4', '16.19.2']) {
        const driver = makeDriver(WATCH);
        driver.cachedWdaStatus = {build: {version}};
        const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
        await assert.rejects(driver.mobileSwipe(direction, 2), (err: unknown) => {
          assert.ok(err instanceof errors.InvalidArgumentError, `expected InvalidArgumentError, got ${String(err)}`);
          assert.match(err.message, /The 'velocity' parameter is not supported on watchOS/);
          return true;
        });
        sinon.assert.notCalled(proxy);
      }
    });

    it('should keep the swipe velocity on iOS', async function () {
      const driver = makeDriver(IOS);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await driver.mobileSwipe(direction, 2);
      sinon.assert.calledWith(proxy, '/wda/swipe', 'POST', {direction, velocity: 2});
    });

    // A velocity of zero or less never selects the velocity-carrying XCTest call - the agent's
    // dispatcher only does that for a positive value - so on watchOS those requests ask for exactly
    // the plain swipe that is measured to work, and must not be turned into an error.
    for (const velocity of [0, -1]) {
      it(`should treat a swipe velocity of ${velocity} as a plain swipe on watchOS`, async function () {
        const driver = makeDriver(WATCH);
        driver.cachedWdaStatus = {build: {version: '16.19.2'}};
        const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
        await driver.mobileSwipe(direction, velocity);
        sinon.assert.calledWith(proxy, '/wda/swipe', 'POST', {direction});
      });
    }

    // The same request on iOS must keep working exactly as before, which means the agent is not
    // sent a value it would ignore anyway.
    it('should drop a non-positive swipe velocity on iOS', async function () {
      const driver = makeDriver(IOS);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves({});
      await driver.mobileSwipe(direction, 0);
      sinon.assert.calledWith(proxy, '/wda/swipe', 'POST', {direction});
    });
  });

  describe('alert commands', function () {
    // WatchOS has no element typed XCUIElementTypeAlert, so the agent can never act on one. The
    // routes are deliberately NOT gated: WebDriverAgent answers `no such alert`, which is the
    // spec-correct status for "there is no alert open", while NotImplementedError would claim the
    // platform cannot answer the question at all.
    it('should proxy the alert routes on watchOS instead of gating them', async function () {
      const driver = makeDriver(WATCH);
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves([]);
      await driver.postAcceptAlert();
      await driver.postDismissAlert();
      await driver.getAlertButtons();
      sinon.assert.calledWith(proxy, '/alert/accept', 'POST');
      sinon.assert.calledWith(proxy, '/alert/dismiss', 'POST');
      sinon.assert.calledWith(proxy, '/wda/alert/buttons', 'GET');
    });

    it('should not ask the agent to auto-handle alerts on watchOS', async function () {
      const caps = await captureWdaSessionCaps(WATCH, {autoAcceptAlerts: true});
      assert.equal(caps.defaultAlertAction, undefined);
    });

    it('should name the reason the alert caps are dropped on watchOS', async function () {
      const driver = makeDriver(WATCH);
      driver.opts.autoAcceptAlerts = true;
      sandbox.stub(driver, 'proxyCommand').resolves({});
      const warn = sandbox.spy(driver.log, 'warn');
      await startWdaSession.call(driver, 'com.test.app');
      sinon.assert.calledOnce(warn);
      assert.match(
        String(warn.firstCall.args.join(' ')),
        /Automatic alert handling is not supported on watchOS: watchOS never types an alert/,
      );
    });

    it('should still forward the alert action on iOS', async function () {
      const caps = await captureWdaSessionCaps(IOS, {autoAcceptAlerts: true});
      assert.equal(caps.defaultAlertAction, 'accept');
    });

    it('should forward a dismiss action on iOS', async function () {
      const caps = await captureWdaSessionCaps(IOS, {autoDismissAlerts: true});
      assert.equal(caps.defaultAlertAction, 'dismiss');
    });
  });
});
