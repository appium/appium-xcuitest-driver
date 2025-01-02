import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';


describe('get deviceinfo commands', function () {
  const driver = new XCUITestDriver();
  driver.wda = {jwproxy: {command: () => {}}};
  let proxyStub;

  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

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
    await driver.mobileGetDeviceInfo().should.eventually.eql(opts);
  });

  it('get device info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await driver.mobileGetDeviceInfo().should.be.rejected;
  });
});
