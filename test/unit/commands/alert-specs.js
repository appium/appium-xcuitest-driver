import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('alert commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('getAlertText', () => {
    it('should send translated GET request to WDA', async () => {
      await driver.getAlertText();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/alert/text');
      proxySpy.firstCall.args[1].should.eql('GET');
    });
  });
  describe.skip('setAlertText', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.setAlertText('some text');
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/alert/text');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql('some text');
    });
  });
  describe('postAcceptAlert', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.postAcceptAlert();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/alert/accept');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });
  describe('postDismissAlert', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.postDismissAlert();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/alert/dismiss');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });
});
