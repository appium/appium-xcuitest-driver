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

    it('stops the automation session and reconnects the remote debugger to release the automation grant', async function () {
      const stopAutomationSessionStub = sandbox.stub();
      const stopRemoteStub = sandbox.stub(driver, 'stopRemote');
      driver._remote = {
        automationSession: {isStarted: true},
        stopAutomationSession: stopAutomationSessionStub,
      } as any;
      await driver.mobileStopAutomationSession();
      assert.strictEqual(stopAutomationSessionStub.calledOnceWithExactly(), true);
      assert.strictEqual(stopRemoteStub.calledOnceWithExactly(), true);
      assert.strictEqual(stopAutomationSessionStub.calledBefore(stopRemoteStub), true);
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
