import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import sharp from 'sharp';
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
  describe('getViewportScreenshot', function () {
    async function screenshot(width: number, height: number): Promise<string> {
      return (
        await sharp({create: {width, height, channels: 3, background: '#abcdef'}})
          .png()
          .toBuffer()
      ).toString('base64');
    }

    it('should crop each display using fresh geometry and the captured image bounds', async function () {
      // The image is one pixel larger than the logical window scaled by two.
      // Cropping must retain the right and bottom edges, including in a smaller app window.
      const capture = sinon.stub(driver, 'getScreenshot');
      sinon.stub(driver, 'getWindowRect').resolves({x: 0, y: 0, width: 400, height: 600});
      for (const [width, height, scale, bar] of [
        [1398, 2034, 3, 20],
        [1903, 1339, 2, 24.5],
        [1903, 1339, 2, 0],
        [1398, 2034, 3, 24],
      ]) {
        const original = await screenshot(width, height);
        capture.resolves(original);
        proxyStub.withArgs('/wda/screen', 'GET').resolves({scale, statusBarSize: {width: width / scale, height: bar}});
        proxyStub.resetHistory();
        const result = await driver.getViewportScreenshot();
        const expected = await sharp(Buffer.from(original, 'base64'))
          .extract({left: 0, top: Math.trunc(bar * scale), width, height: height - Math.trunc(bar * scale)})
          .raw()
          .toBuffer();
        assert.deepEqual(await sharp(Buffer.from(result, 'base64')).raw().toBuffer(), expected);
        const dimensions = await sharp(Buffer.from(result, 'base64')).metadata();
        assert.equal(dimensions.width, width);
        assert.equal(dimensions.height, height - Math.trunc(bar * scale));
        if (!bar) {
          assert.equal(result, original);
        }
        sinon.assert.calledOnce(proxyStub);
      }
    });

    it('should return the original screenshot when status bar geometry cannot be cropped', async function () {
      const original = await screenshot(10, 10);
      sinon.stub(driver, 'getScreenshot').resolves(original);
      for (const [scale, bar] of [
        [2, 5],
        [2, 6],
        [2, -1],
        [2, NaN],
        [Infinity, 1],
      ]) {
        proxyStub.resolves({scale, statusBarSize: {width: 5, height: bar}});
        assert.equal(await driver.getViewportScreenshot(), original);
      }
    });

    it('should return web viewport screenshots without requesting native geometry', async function () {
      sinon.stub(driver, 'isWebContext').returns(true);
      const capture = sinon.stub(driver, '_webExecutionBackend').get(() => ({
        screenshot: async () => 'web screenshot',
      }));
      try {
        assert.equal(await driver.getViewportScreenshot(), 'web screenshot');
        sinon.assert.notCalled(proxyStub);
      } finally {
        capture.restore();
      }
    });
  });
});
