import { errors } from 'appium-base-driver';
import sinon from 'sinon';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import XCUITestDriver from '../../..';


chai.should();
chai.use(chaiAsPromised);

describe('proxy commands', function () {
  let driver = new XCUITestDriver();
  // give the driver a spy-able proxy object
  driver.wda = {jwproxy: {command: () => {}}};
  let proxyStub = sinon.stub(driver.wda.jwproxy, 'command');

  afterEach(function () {
    if (proxyStub) {
      proxyStub.reset();
    }
  });

  describe('proxyCommand', function () {
    it('should send command through WDA', async function () {
      proxyStub.returns({status: 0});

      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/some/endpoint');
      proxyStub.firstCall.args[1].should.eql('POST');
      proxyStub.firstCall.args[2].some.should.eql('stuff');
    });
    it('should throw an error if no endpoint is given', async function () {
      await driver.proxyCommand(null, 'POST', {some: 'stuff'}).should.eventually.be.rejectedWith(/endpoint/);
      proxyStub.callCount.should.eql(0);
    });
    it('should throw an error if no endpoint is given', async function () {
      await driver.proxyCommand('/some/endpoint', null, {some: 'stuff'}).should.eventually.be.rejectedWith(/GET, POST/);
      proxyStub.callCount.should.eql(0);
    });
    it('should throw an error if wda returns an error (even if http status is 200)', async function () {
      proxyStub.returns({status: 13, value: 'WDA error occurred'});
      try {
        await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
      } catch (err) {
        err.jsonwpCode.should.eql(13);
        err.message.should.include('WDA error occurred');
        err.should.be.an.instanceof(errors.UnknownError);
      }
      proxyStub.calledOnce.should.be.true;
    });
    it('should not throw an error if no status is returned', async function () {
      proxyStub.returns({value: 'WDA error occurred'});
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
      proxyStub.calledOnce.should.be.true;
    });
  });
});
