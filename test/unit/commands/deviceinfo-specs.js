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
    proxyStub.returns({
      timeZone: 'America/New_York',
      locale: 'ja_EN',
    });

    const out = await driver.mobileGetDeviceInfo();
    out.locale.should.eq('ja_EN');
    out.timeZone.should.eq('America/New_York');
  });

  it('get device info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await driver.mobileGetDeviceInfo().should.be.rejected;
  });
});
