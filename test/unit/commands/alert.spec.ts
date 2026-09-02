import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('alert commands', function () {
  const driver = new XCUITestDriver({} as any);
  const proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('getAlertText', function () {
    it('should send translated GET request to WDA', async function () {
      await driver.getAlertText();
      assert.strictEqual(proxySpy.calledOnce, true);
      assert.strictEqual(proxySpy.firstCall.args[0], '/alert/text');
      assert.strictEqual(proxySpy.firstCall.args[1], 'GET');
    });

    describe('in a web context', function () {
      let sandbox: sinon.SinonSandbox;

      afterEach(function () {
        sandbox.restore();
      });

      it('returns null when getDialogMessage throws NoAlertOpenError, without calling isShowingJavaScriptDialog', async function () {
        sandbox = sinon.createSandbox();
        sandbox.stub(driver, 'isWebContext').returns(true);
        const backendStub = {
          isShowingJavaScriptDialog: sandbox.stub(),
          getDialogMessage: sandbox.stub().rejects(new errors.NoAlertOpenError()),
        };
        sandbox.stub(driver, '_webExecutionBackend').get(() => backendStub as any);

        const result = await driver.getAlertText();

        // isShowingJavaScriptDialog is deliberately not consulted: AtomsBackend's implementation
        // is checkForAlert(), which itself calls getAlertText() - calling it here would recurse.
        assert.strictEqual(result, null);
        assert.strictEqual(backendStub.isShowingJavaScriptDialog.called, false);
      });

      it('returns the dialog message when a dialog is showing', async function () {
        sandbox = sinon.createSandbox();
        sandbox.stub(driver, 'isWebContext').returns(true);
        const backendStub = {
          isShowingJavaScriptDialog: sandbox.stub(),
          getDialogMessage: sandbox.stub().resolves('hello'),
        };
        sandbox.stub(driver, '_webExecutionBackend').get(() => backendStub as any);

        const result = await driver.getAlertText();

        assert.strictEqual(result, 'hello');
      });

      it('rethrows any other error from getDialogMessage', async function () {
        sandbox = sinon.createSandbox();
        sandbox.stub(driver, 'isWebContext').returns(true);
        const backendStub = {
          isShowingJavaScriptDialog: sandbox.stub(),
          getDialogMessage: sandbox.stub().rejects(new errors.UnknownError('boom')),
        };
        sandbox.stub(driver, '_webExecutionBackend').get(() => backendStub as any);

        await assert.rejects(driver.getAlertText(), errors.UnknownError);
      });

      it('regression: does not recurse through checkForAlert when routed to the real AtomsBackend', async function () {
        // AtomsBackend.isShowingJavaScriptDialog() is checkForAlert(), which itself calls
        // driver.getAlertText() - if getAlertText() ever called isShowingJavaScriptDialog() again
        // first, this would hang instead of resolving.
        sandbox = sinon.createSandbox();
        sandbox.stub(driver, 'isWebContext').returns(true);
        proxySpy.resolves(null);

        const result = await driver.getAlertText();

        assert.strictEqual(result, null);
        assert.strictEqual(proxySpy.calledOnce, true);
      });
    });
  });
  describe('setAlertText', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.setAlertText('some text');
      assert.strictEqual(proxySpy.calledOnceWithExactly('/alert/text', 'POST', {value: 'some text'}), true);
    });
  });
  describe('postAcceptAlert', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.postAcceptAlert();
      assert.strictEqual(proxySpy.calledOnce, true);
      assert.strictEqual(proxySpy.firstCall.args[0], '/alert/accept');
      assert.strictEqual(proxySpy.firstCall.args[1], 'POST');
    });
  });
  describe('postDismissAlert', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.postDismissAlert();
      assert.strictEqual(proxySpy.calledOnce, true);
      assert.strictEqual(proxySpy.firstCall.args[0], '/alert/dismiss');
      assert.strictEqual(proxySpy.firstCall.args[1], 'POST');
    });
  });

  describe('mobile: alert', function () {
    const commandName = 'alert';

    it('should reject request to WDA if action parameter is not supported', async function () {
      await assert.rejects(driver.execute(`mobile: ${commandName}`, {action: 'blabla'}), /should be either/);
    });

    it('should send accept alert request to WDA with encoded button label', async function () {
      const buttonLabel = 'some label';
      await driver.execute(`mobile: ${commandName}`, {action: 'accept', buttonLabel});
      assert.strictEqual(proxySpy.calledOnceWithExactly('/alert/accept', 'POST', {name: buttonLabel}), true);
    });

    it('should send dimsiss alert request to WDA if button label is not provided', async function () {
      await driver.execute(`mobile: ${commandName}`, {action: 'dismiss'});
      assert.strictEqual(proxySpy.calledOnce, true);
      assert.strictEqual(proxySpy.firstCall.args[0], `/alert/dismiss`);
      assert.strictEqual(proxySpy.firstCall.args[1], 'POST');
    });

    it('should send get alert buttons request to WDA', async function () {
      const buttonLabel = 'OK';
      proxySpy.resolves({
        value: [buttonLabel],
        sessionId: '05869B62-C559-43AD-A343-BAACAAE00CBB',
        status: 0,
      });
      const response = /** @type { {value: string[]} } */ await driver.execute(`mobile: ${commandName}`, {
        action: 'getButtons',
      });
      assert.strictEqual(proxySpy.calledOnce, true);
      assert.strictEqual(proxySpy.firstCall.args[0], '/wda/alert/buttons');
      assert.strictEqual(proxySpy.firstCall.args[1], 'GET');
      assert.strictEqual((response as any).value[0], buttonLabel);
    });
  });
});
