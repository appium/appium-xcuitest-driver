import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {expect} from 'chai';


describe('get activeapp commands', function () {
  const driver = new XCUITestDriver();
  driver.wda = {jwproxy: {command: async () => ({})} as any} as any;
  let proxyStub;

  before(async function () {
    const chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    chai.use(chaiAsPromised.default);
  });

  beforeEach(function () {
    proxyStub = sinon.stub(driver.wda.jwproxy, 'command');
  });

  afterEach(function () {
    proxyStub.restore();
  });

  it('get active app info', async function () {
    proxyStub.returns({
      pid: 15438,
      name: '',
      bundleId: 'com.apple.DocumentsApp',
      processArguments: {env: {HAPPY: 'testing'}, args: ['happy', 'testing']},
    });

    const out = await driver.mobileGetActiveAppInfo();
    expect(out.pid).to.eq(15438);
    expect(out.name).to.eq('');
    expect(out.bundleId).to.eq('com.apple.DocumentsApp');
    expect(out.processArguments.env.HAPPY).to.eq('testing');
    expect(out.processArguments.args[0]).to.eq('happy');
    expect(out.processArguments.args[1]).to.eq('testing');
  });

  it('get active app info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await expect(driver.mobileGetActiveAppInfo()).to.be.rejected;
  });
});
