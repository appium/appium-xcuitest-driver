import {errors} from 'appium/driver';
import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';


describe('proxy commands', function () {
  let driver = new XCUITestDriver();
  driver.wda = {jwproxy: {command: () => {}}};

  let chai;
  let mockJwproxy;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  beforeEach(function () {
    mockJwproxy = sinon.mock(driver.wda.jwproxy);
  });

  afterEach(function () {
    mockJwproxy.verify();
  });

  describe('proxyCommand', function () {
    it('should send command through WDA', async function () {
      mockJwproxy.expects('command').once().withExactArgs(
        '/some/endpoint',
        'POST',
        { some: 'stuff' }
      );
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
    });

    it('should throw an error if no endpoint is given', async function () {
      mockJwproxy.expects('command').never().called;
      // @ts-expect-error incorrect usage
      await driver.proxyCommand(null, 'POST', {some: 'stuff'}).should.be.rejectedWith(/endpoint/);
    });
    it('should throw an error if no method is given', async function () {
      mockJwproxy.expects('command').never().called;
      await driver
        // @ts-expect-error incorrect usage
        .proxyCommand('/some/endpoint', null, {some: 'stuff'})
        .should.be.rejectedWith(/GET, POST/);
    });
    it('should throw an error if wda returns an error (even if http status is 200)', async function () {
      mockJwproxy.expects('command').once().returns({status: 13, value: 'WDA error occurred'});
      try {
        await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
      } catch (err) {
        err.jsonwpCode.should.eql(13);
        err.message.should.include('WDA error occurred');
        err.should.be.an.instanceof(errors.UnknownError);
      }
    });
    it('should not throw an error if no status is returned', async function () {
      mockJwproxy.expects('command').once().returns({value: 'WDA error occurred'});
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
    });
  });
});
