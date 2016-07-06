import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('source commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.spy(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('getPageSource', () => {
    it('should send translated POST request to WDA', () => {
      driver.getPageSource();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/source');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });
});
