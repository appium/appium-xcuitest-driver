import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('navigation commands', function () {
  let driver: XCUITestDriver;
  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    driver.sessionId = 'session-id';
    driver.implicitWaitMs = 700;
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('nativeBack', function () {
    it('should fall back to the first navigation bar button without waiting for the implicit timeout', async function () {
      const proxy = sandbox.stub(driver, 'proxyCommand').callsFake(async (url: string, method: string, body: any) => {
        if (url === '/element') {
          return {ELEMENT: 'navbar'};
        }
        if (url === '/element/navbar/elements' && body?.value.includes('label == "Back"')) {
          return [];
        }
        if (url === '/element/navbar/elements') {
          return [{ELEMENT: 'retour'}];
        }
        throw new Error(`Unexpected ${method} ${url}`);
      });
      const click = sandbox.stub(driver, 'nativeClick').resolves();

      await driver.nativeBack();

      assert.strictEqual(proxy.callCount, 3, `expected three lookups, got ${proxy.callCount}`);
      assert.ok(click.calledOnceWithExactly({ELEMENT: 'retour'} as any));
      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should click the back button when it is labelled "Back"', async function () {
      const proxy = sandbox.stub(driver, 'proxyCommand').callsFake(async (url: string, method: string, body: any) => {
        if (url === '/element') {
          return {ELEMENT: 'navbar'};
        }
        if (url === '/element/navbar/elements' && body?.value.includes('label == "Back"')) {
          return [{ELEMENT: 'back'}];
        }
        throw new Error(`Unexpected ${method} ${url}`);
      });
      const click = sandbox.stub(driver, 'nativeClick').resolves();

      await driver.nativeBack();

      assert.strictEqual(proxy.callCount, 2, `expected two lookups, got ${proxy.callCount}`);
      assert.ok(click.calledOnceWithExactly({ELEMENT: 'back'} as any));
      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should honor the implicit wait while the navigation bar is not yet shown', async function () {
      const proxy = sandbox.stub(driver, 'proxyCommand').rejects(new Error('no such element'));
      const click = sandbox.stub(driver, 'nativeClick').resolves();

      await driver.nativeBack();

      assert.ok(proxy.callCount > 1, `expected the navigation bar lookup to be retried, got ${proxy.callCount}`);
      assert.strictEqual(click.callCount, 0);
      assert.strictEqual(driver.implicitWaitMs, 700);
    });
  });
});
