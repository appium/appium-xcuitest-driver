import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('background', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.background();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/deactivateApp');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });

  describe('touch id', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.touchId();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/simulator/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: true});
    });
    it('should send translated POST request to WDA with true', async () => {
      await driver.touchId(true);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/simulator/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: true});
    });
    it('should send translated POST request to WDA with false', async () => {
      await driver.touchId(false);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/simulator/touch_id');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({match: false});
    });
  });
});
