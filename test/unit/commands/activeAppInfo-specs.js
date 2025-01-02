import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';


describe('get activeapp commands', function () {
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

  it('get active app info', async function () {
    proxyStub.returns({
      pid: 15438,
      name: '',
      bundleId: 'com.apple.DocumentsApp',
      processArguments: {env: {HAPPY: 'testing'}, args: ['happy', 'testing']},
    });

    const out = await driver.mobileGetActiveAppInfo();
    out.pid.should.eq(15438);
    out.name.should.eq('');
    out.bundleId.should.eq('com.apple.DocumentsApp');
    out.processArguments.env.HAPPY.should.eq('testing');
    out.processArguments.args[0].should.eq('happy');
    out.processArguments.args[1].should.eq('testing');
  });

  it('get active app info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await driver.mobileGetActiveAppInfo().should.be.rejected;
  });
});
