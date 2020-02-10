import sinon from 'sinon';
import XCUITestDriver from '../../..';
import Simctl from 'node-simctl';


describe('screenshots commands', function () {
  let driver;
  let proxyStub;

  const base64PortraitResponse = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(function () {
    driver = new XCUITestDriver();
    driver.opts = {
      device: {
        simctl: new Simctl(),
      }
    };
    proxyStub = sinon.stub(driver, 'proxyCommand');
  });
  afterEach(function () {
    proxyStub.reset();
  });

  describe('getScreenshot', function () {
    describe('simulator', function () {
      let simctlStub = sinon.stub(Simctl.prototype, 'getScreenshot');

      afterEach(function () {
        simctlStub.reset();
      });

      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);
        driver.opts.realDevice = false;

        await driver.getScreenshot();

        proxyStub.calledOnce.should.be.true;
        proxyStub.firstCall.args[0].should.eql('/screenshot');
        proxyStub.firstCall.args[1].should.eql('GET');

        simctlStub.notCalled.should.be.true;
      });

      it('should get a screenshot from simctl if WDA call fails and Xcode version >= 8.1', async function () {
        proxyStub.returns(null);
        simctlStub.returns(base64PortraitResponse);

        driver.opts.realDevice = false;
        driver.xcodeVersion = {
          versionFloat: 8.3
        };
        const result = await driver.getScreenshot();
        result.should.equal(base64PortraitResponse);

        proxyStub.calledOnce.should.be.true;
        simctlStub.calledOnce.should.be.true;
      });
    });

    describe('real device', function () {
      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64PortraitResponse);
        driver.opts.realDevice = true;

        await driver.getScreenshot();

        proxyStub.calledOnce.should.be.true;
        proxyStub.firstCall.args[0].should.eql('/screenshot');
        proxyStub.firstCall.args[1].should.eql('GET');
      });
    });
  });
});
