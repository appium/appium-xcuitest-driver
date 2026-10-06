import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('screenshots commands', function () {
  let driver: XCUITestDriver;
  let proxyStub: sinon.SinonStub;

  const base64PortraitResponse =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    proxyStub = sinon.stub(driver, 'proxyCommand');
  });
  afterEach(function () {
    proxyStub.reset();
  });

  describe('getScreenshot', function () {
    it('should only correct MJPEG orientation when explicitly enabled', async function () {
      const convert = sinon.stub().resolves(base64PortraitResponse);
      driver.mjpegStream = {lastChunkPNGBase64: convert} as any;
      for (const setting of [undefined, true, false]) {
        if (setting !== undefined) {
          await driver.updateSettings({mjpegFixOrientation: setting});
        }
        convert.resetHistory();
        assert.equal(await driver.getScreenshot(), base64PortraitResponse);
        sinon.assert.calledOnceWithExactly(convert, setting === true);
      }
    });

    describe('simulator', function () {
      let getScreenshotStub: sinon.SinonStub;

      beforeEach(function () {
        getScreenshotStub = sinon.stub().resolves(Buffer.alloc(0));
        driver.isSimulator = () => true;
        driver._device = {getScreenshot: getScreenshotStub} as any;
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
        const screenshotBuffer = Buffer.from(base64PortraitResponse, 'base64');
        getScreenshotStub.resolves(screenshotBuffer);

        driver.xcodeVersion = {
          versionFloat: 8.3,
        } as any;
        const result = await driver.getScreenshot();
        assert.strictEqual(result, screenshotBuffer.toString('base64'));

        assert.strictEqual(proxyStub.calledOnce, true);
        assert.strictEqual(getScreenshotStub.calledOnce, true);
      });

      it('should throw UnableToCaptureScreen if the simulator returns an empty buffer', async function () {
        proxyStub.returns(null);
        getScreenshotStub.resolves(Buffer.alloc(0));

        driver.xcodeVersion = {
          versionFloat: 8.3,
        } as any;
        await assert.rejects(driver.getScreenshot(), errors.UnableToCaptureScreen);
      });
    });

    describe('real device', function () {
      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);

        driver._device = {devicectl: true} as any;
        await driver.getScreenshot();

        assert.strictEqual(proxyStub.calledOnce, true);
        assert.strictEqual(proxyStub.firstCall.args[0], '/screenshot');
        assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
      });
    });
  });
});
