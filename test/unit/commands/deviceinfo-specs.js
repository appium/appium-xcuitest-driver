import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';


describe('get deviceinfo commands', function () {
  const driver = new XCUITestDriver();
  // @ts-ignore give the driver a spy-able proxy object
  driver.wda = {jwproxy: {command: () => {}}};
  let proxyStub;

  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    expect = chai.expect;
  });

  beforeEach(function () {
    // @ts-ignore ok for tests
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

    expect(await driver.mobileGetDeviceInfo()).to.eql(opts);
  });

  it('get device info raise an error if the endpoint raises error', function () {
    proxyStub.throws();
    expect(driver.mobileGetDeviceInfo()).to.eventually.be.rejected;
  });
});
