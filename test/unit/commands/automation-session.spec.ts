import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';

import {requireAutomationSessionActive} from '../../../lib/commands/helpers/index.js';
import {XCUITestDriver} from '../../../lib/driver.js';
import {AtomsBackend} from '../../../lib/web-execution/atoms-backend.js';
import {AutomationSessionBackend} from '../../../lib/web-execution/automation-session-backend.js';

describe('automation-session commands', function () {
  let sandbox: sinon.SinonSandbox;
  let driver: XCUITestDriver;

  beforeEach(function () {
    sandbox = createSandbox();
    driver = new XCUITestDriver({} as any);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('mobileStartAutomationSession', function () {
    it('throws when not in a web context', async function () {
      sandbox.stub(driver, 'isWebContext').returns(false);
      await assert.rejects(driver.mobileStartAutomationSession(), errors.NotImplementedError);
    });

    it('throws when not running on a Simulator', async function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      sandbox.stub(driver, 'isSimulator').returns(false);
      await assert.rejects(driver.mobileStartAutomationSession());
    });

    it('starts an automation session on the remote debugger when in a web context on a Simulator', async function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      sandbox.stub(driver, 'isSimulator').returns(true);
      const session = {} as any;
      const startAutomationSessionStub = sandbox.stub().resolves(session);
      driver._remote = {startAutomationSession: startAutomationSessionStub} as any;
      await driver.mobileStartAutomationSession();
      assert.strictEqual(startAutomationSessionStub.calledOnceWithExactly(), true);
    });

    it('remembers the current context so it can be restored on stop', async function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      sandbox.stub(driver, 'isSimulator').returns(true);
      driver._remote = {startAutomationSession: sandbox.stub().resolves({})} as any;
      driver.curContext = 'PID:123.4';
      await driver.mobileStartAutomationSession();
      assert.strictEqual(driver._preAutomationSessionContext, 'PID:123.4');
    });

    it('seeds the session with the driver current page-load/script/implicit-wait timeouts', async function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      sandbox.stub(driver, 'isSimulator').returns(true);
      const session = {} as any;
      driver._remote = {startAutomationSession: sandbox.stub().resolves(session)} as any;
      driver.pageLoadMs = 12345;
      driver.asyncWaitMs = 6789;
      driver.implicitWaitMs = 42;
      await driver.mobileStartAutomationSession();
      assert.strictEqual(session.pageLoadTimeoutMs, 12345);
      assert.strictEqual(session.scriptTimeoutMs, 6789);
      assert.strictEqual(session.implicitWaitTimeoutMs, 42);
    });
  });

  describe('mobileStopAutomationSession', function () {
    it('is a no-op when no automation session is active', async function () {
      const stopRemoteStub = sandbox.stub(driver, 'stopRemote');
      driver._remote = null;
      await driver.mobileStopAutomationSession();
      assert.strictEqual(stopRemoteStub.called, false);

      driver._remote = {automationSession: {isStarted: false}} as any;
      await driver.mobileStopAutomationSession();
      assert.strictEqual(stopRemoteStub.called, false);
    });

    it('stops the automation session (closeAllWindows on by default) and reconnects the remote debugger', async function () {
      const stopAutomationSessionStub = sandbox.stub();
      const stopRemoteStub = sandbox.stub(driver, 'stopRemote');
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: stopAutomationSessionStub,
      } as any;
      await driver.mobileStopAutomationSession();
      assert.strictEqual(stopAutomationSessionStub.calledOnceWithExactly({closeAllWindows: true}), true);
      assert.strictEqual(stopRemoteStub.calledOnceWithExactly(), true);
      assert.strictEqual(stopAutomationSessionStub.calledBefore(stopRemoteStub), true);
    });

    it('passes closeAllWindows through to remote.stopAutomationSession', async function () {
      const stopAutomationSessionStub = sandbox.stub();
      sandbox.stub(driver, 'stopRemote').resolves();
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: stopAutomationSessionStub,
      } as any;
      await driver.mobileStopAutomationSession(false);
      assert.strictEqual(stopAutomationSessionStub.calledOnceWithExactly({closeAllWindows: false}), true);
    });

    it('switches back to the pre-automation-session context if it still exists after reconnecting', async function () {
      sandbox.stub(driver, 'stopRemote').resolves();
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: sandbox.stub(),
      } as any;
      driver._preAutomationSessionContext = 'PID:123.4';
      // getContextsAndViews() reports webview ids WEBVIEW_-prefixed; curContext is unprefixed.
      sandbox
        .stub(driver, 'getContextsAndViews')
        .resolves([{id: 'WEBVIEW_PID:123.4'}, {id: 'WEBVIEW_PID:123.5'}] as any);
      const setContextStub = sandbox.stub(driver, 'setContext').resolves();

      await driver.mobileStopAutomationSession();

      assert.strictEqual(setContextStub.calledOnceWithExactly('PID:123.4'), true);
      assert.strictEqual(driver._preAutomationSessionContext, null);
    });

    it('does not try to switch back if the pre-automation-session context no longer exists', async function () {
      sandbox.stub(driver, 'stopRemote').resolves();
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: sandbox.stub(),
      } as any;
      driver._preAutomationSessionContext = 'PID:123.4';
      sandbox.stub(driver, 'getContextsAndViews').resolves([{id: 'WEBVIEW_PID:123.5'}] as any);
      const setContextStub = sandbox.stub(driver, 'setContext').resolves();

      await driver.mobileStopAutomationSession();

      assert.strictEqual(setContextStub.called, false);
    });

    it('does not attempt a restore when no context was recorded before starting', async function () {
      sandbox.stub(driver, 'stopRemote').resolves();
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: sandbox.stub(),
      } as any;
      driver._preAutomationSessionContext = null;
      const getContextsStub = sandbox.stub(driver, 'getContextsAndViews').resolves([] as any);

      await driver.mobileStopAutomationSession();

      assert.strictEqual(getContextsStub.called, false);
    });

    it('does not attempt a restore when restorePreviousContext is false', async function () {
      sandbox.stub(driver, 'stopRemote').resolves();
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: sandbox.stub(),
      } as any;
      driver._preAutomationSessionContext = 'PID:123.4';
      const getContextsStub = sandbox.stub(driver, 'getContextsAndViews').resolves([] as any);

      await driver.mobileStopAutomationSession(false, false);

      assert.strictEqual(getContextsStub.called, false);
      assert.strictEqual(driver._preAutomationSessionContext, null);
    });
  });

  describe('_webExecutionBackend', function () {
    it('routes to the automation session while curContext is still the one it was started from', function () {
      driver._remote = {automationSession: {isStarted: true}} as any;
      driver._preAutomationSessionContext = '123.1';
      driver.curContext = '123.1';
      assert.ok(driver._webExecutionBackend instanceof AutomationSessionBackend);
    });

    it('routes to atoms after switching to a different tab in the same app (same-app/different-page)', function () {
      driver._remote = {automationSession: {isStarted: true}} as any;
      driver._preAutomationSessionContext = '123.1';
      driver.curContext = '123.2';
      assert.ok(driver._webExecutionBackend instanceof AtomsBackend);
    });

    it('routes to atoms after switching to a different app entirely', function () {
      driver._remote = {automationSession: {isStarted: true}} as any;
      driver._preAutomationSessionContext = '123.1';
      driver.curContext = '456.1';
      assert.ok(driver._webExecutionBackend instanceof AtomsBackend);
    });

    it('routes to atoms when no automation session is active, regardless of curContext', function () {
      driver._remote = {automationSession: {isStarted: false}} as any;
      driver._preAutomationSessionContext = '123.1';
      driver.curContext = '123.1';
      assert.ok(driver._webExecutionBackend instanceof AtomsBackend);
    });
  });

  describe('requireAutomationSessionActive', function () {
    it('throws NotImplementedError when there is no remote debugger connection', function () {
      driver._remote = null;
      assert.throws(() => requireAutomationSessionActive(driver, 'Doing the thing'), errors.NotImplementedError);
    });

    it('throws NotImplementedError when an automation session is not started', function () {
      driver._remote = {automationSession: {isStarted: false}} as any;
      assert.throws(() => requireAutomationSessionActive(driver, 'Doing the thing'), errors.NotImplementedError);
    });

    it('throws NotImplementedError when not in a web context', function () {
      sandbox.stub(driver, 'isWebContext').returns(false);
      driver._remote = {automationSession: {isStarted: true}} as any;
      sandbox.stub(driver, '_webExecutionBackend').get(() => new AutomationSessionBackend({} as any));
      assert.throws(() => requireAutomationSessionActive(driver, 'Doing the thing'), errors.NotImplementedError);
    });

    it('returns the active _webExecutionBackend when an automation session is started for the current context', function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      driver._remote = {automationSession: {isStarted: true}} as any;
      const backend = new AutomationSessionBackend({} as any);
      sandbox.stub(driver, '_webExecutionBackend').get(() => backend);
      assert.strictEqual(requireAutomationSessionActive(driver, 'Doing the thing'), backend);
    });

    it('throws NotImplementedError when the automation session belongs to a different context (atoms backend resolved instead)', function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      driver._remote = {automationSession: {isStarted: true}} as any;
      sandbox.stub(driver, '_webExecutionBackend').get(() => ({}) as any);
      assert.throws(() => requireAutomationSessionActive(driver, 'Doing the thing'), errors.NotImplementedError);
    });
  });
});
