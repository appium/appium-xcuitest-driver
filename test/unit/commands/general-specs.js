import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.spy(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('background', () => {
    it('should send translated POST request to WDA', () => {
      driver.background();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/deactivateApp');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });
});
