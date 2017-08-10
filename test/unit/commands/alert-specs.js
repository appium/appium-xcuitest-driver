import sinon from 'sinon';
import XCUITestDriver from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';


chai.should();
chai.use(chaiAsPromised);

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

  describe('mobile: alert', () => {
    const commandName = 'alert';

    it('should reject request to WDA if action parameter is not supported', async () => {
      await driver.execute(`mobile: ${commandName}`, {action: 'blabla'})
        .should.be.rejectedWith(/should be either/);
    });

    it('should send accept alert request to WDA with encoded button label', async () => {
      const buttonLabel = 'some label';
      await driver.execute(`mobile: ${commandName}`, {action: 'accept', buttonLabel});
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/alert/accept');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.have.property('name', buttonLabel);
    });

    it('should send dimsiss alert request to WDA if button label is not provided', async () => {
      await driver.execute(`mobile: ${commandName}`, {action: 'dismiss'});
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql(`/alert/dismiss`);
      proxySpy.firstCall.args[1].should.eql('POST');
    });

    it('should send get alert buttons request to WDA', async () => {
      const buttonLabel = 'OK';
      proxySpy.returns({value: [buttonLabel], sessionId: '05869B62-C559-43AD-A343-BAACAAE00CBB', status: 0});
      const response = await driver.execute(`mobile: ${commandName}`, {action: 'getButtons'});
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/wda/alert/buttons');
      proxySpy.firstCall.args[1].should.eql('GET');
      response.value[0].should.be.equal(buttonLabel);
    });
  });
});
