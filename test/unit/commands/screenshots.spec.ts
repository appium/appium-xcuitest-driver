import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {Simctl} from 'node-simctl';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('screenshots commands', function () {
  let driver: XCUITestDriver;
  let proxyStub: sinon.SinonStub;
  let simctl: Simctl;

  const base64PortraitResponse =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    simctl = new Simctl();
    driver._device = {simctl} as any;
    proxyStub = sinon.stub(driver, 'proxyCommand');
  });
  afterEach(function () {
    proxyStub.reset();
  });

  describe('getScreenshot', function () {
    describe('simulator', function () {
      let getScreenshotStub: sinon.SinonStub;

      beforeEach(function () {
        getScreenshotStub = sinon.stub(simctl, 'getScreenshot');
      });

      afterEach(function () {
        getScreenshotStub.reset();
      });

      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);

        await driver.getScreenshot();

        assert.strictEqual(proxyStub.calledOnce, true);
        assert.strictEqual(proxyStub.firstCall.args[0], '/screenshot');
        assert.strictEqual(proxyStub.firstCall.args[1], 'GET');

        assert.strictEqual(getScreenshotStub.notCalled, true);
      });

      it('should get a screenshot from simctl if WDA call fails and Xcode version >= 8.1', async function () {
        proxyStub.returns(null);
        getScreenshotStub.returns(base64PortraitResponse);

        driver.xcodeVersion = {
          versionFloat: 8.3,
        } as any;
        const result = await driver.getScreenshot();
        assert.strictEqual(result, base64PortraitResponse);

        assert.strictEqual(proxyStub.calledOnce, true);
        assert.strictEqual(getScreenshotStub.calledOnce, true);
      });
    });

    describe('real device', function () {
      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);

        const device = driver.device;
        try {
          driver._device = {devicectl: true} as any;
          await driver.getScreenshot();
        } finally {
          driver._device = device;
        }

        assert.strictEqual(proxyStub.calledOnce, true);
        assert.strictEqual(proxyStub.firstCall.args[0], '/screenshot');
        assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
      });
    });
  });
});
