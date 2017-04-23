import sinon from 'sinon';
import XCUITestDriver from '../../..';

const simctlModule = require('node-simctl');

describe('screenshots commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');
  let simctlSpy = sinon.stub(simctlModule, 'getScreenshot');

  const base64Response = 'aGVsbG8=';

  afterEach(() => {
    proxySpy.reset();
    simctlSpy.reset();
  });

  describe('getScreenshot', () => {
    it('should get a screenshot from WDA if no errors are detected', async () => {
      proxySpy.returns(base64Response);
      await driver.getScreenshot();

      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/screenshot');
      proxySpy.firstCall.args[1].should.eql('GET');

      simctlSpy.notCalled.should.be.true;
    });

    it('should get a screenshot from simctl for simulator if WDA call fails and Xcode version >= 8.1', async () => {
      proxySpy.returns(null);
      simctlSpy.returns(base64Response);

      driver.opts.realDevice = false;
      driver.xcodeVersion = {
        versionFloat: 8.3
      };
      const result = await driver.getScreenshot();
      result.should.equal(base64Response);

      proxySpy.calledOnce.should.be.true;
      simctlSpy.calledOnce.should.be.true;
    });
  });
});
