import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
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
    sandbox.stub(driver, 'isSimulator').returns(false);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('nativeBack', function () {
    function useDuo() {
      (driver.isSimulator as sinon.SinonStub).returns(true);
      sandbox.stub(driver, 'device').get(() => ({
        isDuo: async () => true,
        setSimulatedHingeAngle: async () => {},
      }));
    }

    it('clicks the Duo toolbar Back button without looking for a navigation bar', async function () {
      useDuo();
      const proxy = sandbox.stub(driver, 'proxyCommand').callsFake(async (url, method, body: any) => {
        assert.equal(url, '/elements');
        assert.equal(body.using, 'class chain');
        assert.ok(body.value.includes('XCUIElementTypeToolbar'));
        assert.ok(body.value.includes('name == "BackButton"'));
        assert.ok(body.value.includes('visible == 1 AND enabled == 1'));
        return [{ELEMENT: 'system-back'}];
      });
      const click = sandbox.stub(driver, 'nativeClick').resolves();
      await driver.nativeBack();
      sinon.assert.calledOnce(proxy);
      assert.deepEqual(click.args, [[{ELEMENT: 'system-back'}]]);
      assert.equal(driver.implicitWaitMs, 700);
    });

    it('rejects ambiguous Duo toolbar Back buttons without clicking', async function () {
      useDuo();
      sandbox.stub(driver, 'proxyCommand').resolves([{ELEMENT: 'one'}, {ELEMENT: 'two'}]);
      const click = sandbox.stub(driver, 'nativeClick').resolves();
      await assert.rejects(driver.nativeBack(), errors.InvalidElementStateError);
      sinon.assert.notCalled(click);
      assert.equal(driver.implicitWaitMs, 700);
    });

    it('propagates a failed Duo Back click instead of trying another button', async function () {
      useDuo();
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves([{ELEMENT: 'system-back'}]);
      const failure = new errors.StaleElementReferenceError('Back button disappeared');
      const click = sandbox.stub(driver, 'nativeClick').rejects(failure);
      await assert.rejects(driver.nativeBack(), (err) => err === failure);
      sinon.assert.calledOnce(proxy);
      sinon.assert.calledOnce(click);
    });

    it('uses a labelled navigation-bar Back button when the Duo toolbar has none', async function () {
      useDuo();
      const proxy = sandbox.stub(driver, 'proxyCommand');
      proxy.onCall(0).resolves([]);
      proxy.onCall(1).resolves({ELEMENT: 'navbar'});
      proxy.onCall(2).resolves([{ELEMENT: 'nav-back'}]);
      const click = sandbox.stub(driver, 'nativeClick').resolves();
      await driver.nativeBack();
      assert.deepEqual(click.args, [[{ELEMENT: 'nav-back'}]]);
      assert.equal(proxy.callCount, 3);
    });

    it('does not guess an arbitrary Duo navigation-bar button when Back is missing', async function () {
      useDuo();
      const proxy = sandbox.stub(driver, 'proxyCommand');
      proxy.onCall(0).resolves([]);
      proxy.onCall(1).resolves({ELEMENT: 'navbar'});
      proxy.onCall(2).resolves([]);
      const click = sandbox.stub(driver, 'nativeClick').resolves();
      await assert.rejects(driver.nativeBack(), errors.NoSuchElementError);
      sinon.assert.notCalled(click);
      assert.equal(proxy.callCount, 3);
    });

    it('propagates Duo lookup errors and restores the implicit wait', async function () {
      useDuo();
      const failure = new Error('WDA disconnected');
      sandbox.stub(driver, 'proxyCommand').rejects(failure);
      const click = sandbox.stub(driver, 'nativeClick').resolves();
      await assert.rejects(driver.nativeBack(), (err) => err === failure);
      sinon.assert.notCalled(click);
      assert.equal(driver.implicitWaitMs, 700);
    });

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
