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
      assert.strictEqual(driver.asyncWaitMs, 5000);
      // GET /timeouts is served from BaseDriver's own scriptTimeoutMs, not our asyncWaitMs.
      assert.strictEqual((await driver.getTimeouts()).script, 5000);
    });

    it('is reachable through the base timeouts() command with the legacy type/ms form', async function () {
      await driver.timeouts('script', 5000);
      assert.strictEqual(driver.asyncWaitMs, 5000);
      assert.strictEqual((await driver.getTimeouts()).script, 5000);
    });

    it('keeps a started automation session in sync', function () {
      (driver as any)._remote = {automationSession: {isStarted: true, scriptTimeoutMs: 0}};
      driver.setScriptTimeout(1234);
      assert.strictEqual(driver.asyncWaitMs, 1234);
      assert.strictEqual((driver as any)._remote.automationSession.scriptTimeoutMs, 1234);
    });
  });

  describe('asyncScriptTimeout (deprecated alias)', function () {
    it('delegates to setScriptTimeout', async function () {
      await driver.asyncScriptTimeout(2345);
      assert.strictEqual(driver.asyncWaitMs, 2345);
    });
  });

  describe('setPageLoadTimeout', function () {
    it('is reachable through the base timeouts() command with a W3C pageLoad value', async function () {
      await driver.timeouts(undefined, undefined, undefined, 6000);
      assert.strictEqual(driver.pageLoadMs, 6000);
      assert.strictEqual((await driver.getTimeouts()).pageLoad, 6000);
    });
  });

  describe('initial (post-construction) defaults', function () {
    // Regression test: GET /timeouts used to report BaseDriver's own stock defaults
    // (script: 30000, pageLoad: 300000) while pageLoadMs/asyncWaitMs (what actually
    // drives browser timeouts) started out at 6000/0 - a fresh session's reported
    // timeouts didn't match its effective behavior.
    it('keeps GET /timeouts in sync with pageLoadMs/asyncWaitMs from the start, before any explicit timeout command', async function () {
      assert.strictEqual(driver.pageLoadMs, 6000);
      assert.strictEqual(driver.asyncWaitMs, 0);
      assert.strictEqual(driver.implicitWaitMs, 0);

      const timeouts = await driver.getTimeouts();
      assert.strictEqual(timeouts.pageLoad, driver.pageLoadMs);
      assert.strictEqual(timeouts.script, driver.asyncWaitMs);
      assert.strictEqual(timeouts.implicit, driver.implicitWaitMs);
    });
  });
});
