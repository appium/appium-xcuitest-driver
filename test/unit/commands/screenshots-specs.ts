import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {Simctl} from 'node-simctl';
import {expect} from 'chai';

describe('screenshots commands', function () {
  let driver;
  let proxyStub;
  let simctl;

  const base64PortraitResponse =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(function () {
    driver = new XCUITestDriver();
    simctl = new Simctl();
    driver._device = { simctl };
    proxyStub = sinon.stub(driver, 'proxyCommand');
  });
  afterEach(function () {
    proxyStub.reset();
  });

  describe('getScreenshot', function () {
    describe('simulator', function () {
      let getScreenshotStub;

      beforeEach(function () {
        getScreenshotStub = sinon.stub(simctl, 'getScreenshot');
      });

      afterEach(function () {
        getScreenshotStub.reset();
      });

      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);

        await driver.getScreenshot();

        expect(proxyStub.calledOnce).to.be.true;
        expect(proxyStub.firstCall.args[0]).to.eql('/screenshot');
        expect(proxyStub.firstCall.args[1]).to.eql('GET');

        expect(getScreenshotStub.notCalled).to.be.true;
      });

      it('should get a screenshot from simctl if WDA call fails and Xcode version >= 8.1', async function () {
        proxyStub.returns(null);
        getScreenshotStub.returns(base64PortraitResponse);

        driver.xcodeVersion = {
          versionFloat: 8.3,
        };
        const result = await driver.getScreenshot();
        expect(result).to.equal(base64PortraitResponse);

        expect(proxyStub.calledOnce).to.be.true;
        expect(getScreenshotStub.calledOnce).to.be.true;
      });
    });

    describe('real device', function () {
      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);

        const device = driver.device;
        try {
          driver._device = {devicectl: true};
          await driver.getScreenshot();
        } finally {
          driver._device = device;
        }

        expect(proxyStub.calledOnce).to.be.true;
        expect(proxyStub.firstCall.args[0]).to.eql('/screenshot');
        expect(proxyStub.firstCall.args[1]).to.eql('GET');
      });
    });
  });
});
