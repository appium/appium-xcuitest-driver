import sinon from 'sinon';
import XCUITestDriver from '../..';


describe('driver commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.spy(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('status', () => {
    it('should send status request to WDA', () => {
      driver.getStatus();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/status');
      proxySpy.firstCall.args[1].should.eql('GET');
    });
  });
});
