import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('alert commands', function () {
  const driver = new XCUITestDriver({} as any);
  const proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('getAlertText', function () {
    it('should send translated GET request to WDA', async function () {
      await driver.getAlertText();
      expect(proxySpy.calledOnce).to.be.true;
      expect(proxySpy.firstCall.args[0]).to.eql('/alert/text');
      expect(proxySpy.firstCall.args[1]).to.eql('GET');
    });
  });
  describe('setAlertText', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.setAlertText('some text');
      expect(proxySpy.calledOnceWithExactly('/alert/text', 'POST', {value: 'some text'})).to.be
        .true;
    });
  });
  describe('postAcceptAlert', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.postAcceptAlert();
      expect(proxySpy.calledOnce).to.be.true;
      expect(proxySpy.firstCall.args[0]).to.eql('/alert/accept');
      expect(proxySpy.firstCall.args[1]).to.eql('POST');
    });
  });
  describe('postDismissAlert', function () {
    it('should send translated POST request to WDA', async function () {
      await driver.postDismissAlert();
      expect(proxySpy.calledOnce).to.be.true;
      expect(proxySpy.firstCall.args[0]).to.eql('/alert/dismiss');
      expect(proxySpy.firstCall.args[1]).to.eql('POST');
    });
  });

  describe('mobile: alert', function () {
    const commandName = 'alert';

    it('should reject request to WDA if action parameter is not supported', async function () {
      await expect(driver.execute(`mobile: ${commandName}`, {action: 'blabla'})).to.be.rejectedWith(
        /should be either/,
      );
    });

    it('should send accept alert request to WDA with encoded button label', async function () {
      const buttonLabel = 'some label';
      await driver.execute(`mobile: ${commandName}`, {action: 'accept', buttonLabel});
      expect(proxySpy.calledOnceWithExactly('/alert/accept', 'POST', {name: buttonLabel})).to.be
        .true;
    });

    it('should send dimsiss alert request to WDA if button label is not provided', async function () {
      await driver.execute(`mobile: ${commandName}`, {action: 'dismiss'});
      expect(proxySpy.calledOnce).to.be.true;
      expect(proxySpy.firstCall.args[0]).to.eql(`/alert/dismiss`);
      expect(proxySpy.firstCall.args[1]).to.eql('POST');
    });

    it('should send get alert buttons request to WDA', async function () {
      const buttonLabel = 'OK';
      proxySpy.resolves({
        value: [buttonLabel],
        sessionId: '05869B62-C559-43AD-A343-BAACAAE00CBB',
        status: 0,
      });
      const response = /** @type { {value: string[]} } */ await driver.execute(
        `mobile: ${commandName}`,
        {action: 'getButtons'},
      );
      expect(proxySpy.calledOnce).to.be.true;
      expect(proxySpy.firstCall.args[0]).to.eql('/wda/alert/buttons');
      expect(proxySpy.firstCall.args[1]).to.eql('GET');
      expect((response as any).value[0]).to.eq(buttonLabel);
    });
  });
});
