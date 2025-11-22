import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('get deviceinfo commands', function () {
  const driver = new XCUITestDriver();
  driver.wda = {jwproxy: {command: async () => ({})} as any} as any;
  let proxyStub;

  beforeEach(function () {
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
    await expect(driver.mobileGetDeviceInfo()).to.eventually.eql(opts);
  });

  it('get device info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await expect(driver.mobileGetDeviceInfo()).to.be.rejected;
  });
});
