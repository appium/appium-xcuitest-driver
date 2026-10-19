import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('timeouts commands', function () {
  let driver: XCUITestDriver;

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
  });

  describe('setScriptTimeout', function () {
    it('is reachable through the base timeouts() command with a W3C script value', async function () {
      // base-driver's timeouts() dispatches the W3C `script` field straight to
      // setScriptTimeout() - this is the actual path a modern client's setTimeout() call takes.
      await driver.timeouts(undefined, undefined, 5000);
      assert.strictEqual(driver.scriptTimeoutMs, 5000);
      assert.strictEqual((await driver.getTimeouts()).script, 5000);
    });

    it('is reachable through the base timeouts() command with the legacy type/ms form', async function () {
      await driver.timeouts('script', 5000);
      assert.strictEqual(driver.scriptTimeoutMs, 5000);
      assert.strictEqual((await driver.getTimeouts()).script, 5000);
    });

    it('keeps a started automation session in sync', function () {
      (driver as any)._remote = {automationSession: {isStarted: true, scriptTimeoutMs: 0}};
      driver.setScriptTimeout(1234);
      assert.strictEqual(driver.scriptTimeoutMs, 1234);
      assert.strictEqual((driver as any)._remote.automationSession.scriptTimeoutMs, 1234);
    });

    it('limits the script timeout of a started automation session to webviewAtomWaitTimeout', function () {
      (driver as any)._remote = {automationSession: {isStarted: true, scriptTimeoutMs: 0}};
      driver.setScriptTimeout(Number.MAX_SAFE_INTEGER);
      assert.strictEqual((driver as any)._remote.automationSession.scriptTimeoutMs, 120000);
    });

    it('gives a started automation session webviewAtomWaitTimeout for a W3C null script timeout (no limit)', function () {
      (driver as any)._remote = {automationSession: {isStarted: true, scriptTimeoutMs: 0}};
      driver.setScriptTimeout(null);
      assert.strictEqual(driver.scriptTimeoutMs, null);
      assert.strictEqual((driver as any)._remote.automationSession.scriptTimeoutMs, 120000);
    });
  });

  describe('setPageLoadTimeout', function () {
    it('gives the driver and a started automation session 1 h for a W3C null page load timeout', async function () {
      (driver as any)._remote = {automationSession: {isStarted: true, pageLoadTimeoutMs: 0}};
      driver.setPageLoadTimeout(null);
      assert.strictEqual(driver.pageLoadMs, 3600000);
      assert.strictEqual((driver as any)._remote.pageLoadMs, 3600000);
      assert.strictEqual((driver as any)._remote.automationSession.pageLoadTimeoutMs, 3600000);
      assert.strictEqual((await driver.getTimeouts()).pageLoad, null);
    });

    it('is reachable through the base timeouts() command with a W3C pageLoad value', async function () {
      await driver.timeouts(undefined, undefined, undefined, 6000);
      assert.strictEqual(driver.pageLoadMs, 6000);
      assert.strictEqual((await driver.getTimeouts()).pageLoad, 6000);
    });
  });

  describe('setImplicitWait', function () {
    it('preserves a null driver timeout and uses zero for the automation session', async function () {
      const session = {isStarted: true, implicitWaitTimeoutMs: 1234};
      (driver as any)._remote = {automationSession: session};
      driver.setImplicitWait(null);
      assert.strictEqual((await driver.getTimeouts()).implicit, null);
      assert.strictEqual(session.implicitWaitTimeoutMs, 0);
      driver.setImplicitWait(1234);
      assert.strictEqual((await driver.getTimeouts()).implicit, 1234);
      assert.strictEqual(session.implicitWaitTimeoutMs, 1234);
    });
  });

  describe('initial (post-construction) defaults', function () {
    // Regression test: GET /timeouts used to report BaseDriver's own stock defaults
    // (script: 30000, pageLoad: 300000) while pageLoadMs (what actually
    // drives browser timeouts) started out at 6000 - a fresh session's reported
    // timeouts didn't match its effective behavior.
    it('keeps GET /timeouts in sync with pageLoadMs from the start, before any explicit timeout command', async function () {
      assert.strictEqual(driver.pageLoadMs, 6000);
      // unset: webviewAtomWaitTimeout limits scripts
      assert.strictEqual(driver.scriptTimeoutMs, null);
      assert.strictEqual(driver.implicitWaitMs, 0);

      const timeouts = await driver.getTimeouts();
      assert.strictEqual(timeouts.pageLoad, driver.pageLoadMs);
      assert.strictEqual(timeouts.script, null);
      assert.strictEqual(timeouts.implicit, driver.implicitWaitMs);
    });
  });
});
