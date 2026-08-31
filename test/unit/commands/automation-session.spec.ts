import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';

import {requireAutomationSessionActive} from '../../../lib/commands/helpers/index.js';
import {XCUITestDriver} from '../../../lib/driver.js';

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

    it('starts an automation session on the remote debugger when in a web context', async function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      const startAutomationSessionStub = sandbox.stub();
      driver._remote = {startAutomationSession: startAutomationSessionStub} as any;
      await driver.mobileStartAutomationSession();
      assert.strictEqual(startAutomationSessionStub.calledOnceWithExactly(), true);
    });

    it('remembers the current context so it can be restored on stop', async function () {
      sandbox.stub(driver, 'isWebContext').returns(true);
      driver._remote = {startAutomationSession: sandbox.stub()} as any;
      driver.curContext = 'PID:123.4';
      await driver.mobileStartAutomationSession();
      assert.strictEqual(driver._preAutomationSessionContext, 'PID:123.4');
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
      sandbox.stub(driver, 'getContextsAndViews').resolves([{id: 'WEBVIEW_PID:123.4'}, {id: 'WEBVIEW_PID:123.5'}] as any);
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

  describe('requireAutomationSessionActive', function () {
    it('throws NotImplementedError when there is no remote debugger connection', function () {
      driver._remote = null;
      assert.throws(() => requireAutomationSessionActive(driver, 'Doing the thing'), errors.NotImplementedError);
    });

    it('throws NotImplementedError when an automation session is not started', function () {
      driver._remote = {automationSession: {isStarted: false}} as any;
      assert.throws(() => requireAutomationSessionActive(driver, 'Doing the thing'), errors.NotImplementedError);
    });

    it('returns the active _webExecutionBackend when an automation session is started', function () {
      const fakeBackend = {setWindowRect: sandbox.stub()};
      driver._remote = {automationSession: {isStarted: true}} as any;
      sandbox.stub(driver, '_webExecutionBackend').get(() => fakeBackend);
      assert.strictEqual(requireAutomationSessionActive(driver, 'Doing the thing'), fakeBackend);
    });
  });
});
