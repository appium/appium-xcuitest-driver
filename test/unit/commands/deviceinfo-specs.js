import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import XCUITestDriver from '../../../';

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
      os: {
        name: 'iOS',
        version: '11.4',
        sdkVersion: '11.3',
      },
      ios: {
        currentLocale: 'ja_EN',
        timeZone: 'US/Pacific',
        simulatorVersion: '11.4',
        ip: 'localhost'
      },
      build: {
        time: 'Jun 24 2018 17:08:21',
        productBundleIdentifier: 'com.facebook.WebDriverAgentRunner'
      }
    });


    const out = await driver.mobileGetDeviceInfo();
    out.locale.should.eq('ja_EN');
    out.timeZone.should.eq('US/Pacific');
  });

  it('get device info, but no proper info because of old WDA', async function () {
    proxyStub.returns({
      os: {
        name: 'iOS',
        version: '11.4',
        sdkVersion: '11.3',
      },
      ios: {
        simulatorVersion: '11.4',
        ip: 'localhost'
      },
      build: {
        time: 'Jun 24 2018 17:08:21',
        productBundleIdentifier: 'com.facebook.WebDriverAgentRunner'
      }
    });

    const out = await driver.mobileGetDeviceInfo();
    out.should.be.empty;
  });
});
