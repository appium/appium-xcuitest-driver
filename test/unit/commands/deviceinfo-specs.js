import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';

chai.should();
chai.use(chaiAsPromised);

describe('get deviceinfo commands', function () {
  const driver = new XCUITestDriver();
  // give the driver a spy-able proxy object
  driver.wda = {jwproxy: {command: () => {}}};
  let proxyStub;

  this.beforeEach(function () {
    proxyStub = sinon.stub(driver.wda.jwproxy, 'command');
  });

  afterEach(function () {
    proxyStub.restore();
  });

  it('get device info', async function () {
    const opts = {
      timeZone: 'America/New_York',
      currentLocale: 'ja_EN',
    };
    proxyStub.returns(opts);

    await driver.mobileGetDeviceInfo().should.eventually.eql(opts);
  });

  it('get device info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await driver.mobileGetDeviceInfo().should.be.rejected;
  });
});
