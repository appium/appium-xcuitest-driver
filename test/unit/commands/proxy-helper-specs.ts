import {errors} from 'appium/driver';
import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('proxy commands', function () {
  const driver = new XCUITestDriver({} as any);
  driver._wda = {jwproxy: {command: async () => ({})} as any} as any;

  let mockJwproxy;

  beforeEach(function () {
    mockJwproxy = sinon.mock(driver.wda.jwproxy);
  });

  afterEach(function () {
    mockJwproxy.verify();
  });

  describe('proxyCommand', function () {
    it('should send command through WDA', async function () {
      mockJwproxy
        .expects('command')
        .once()
        .withExactArgs('/some/endpoint', 'POST', {some: 'stuff'});
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
    });

    it('should throw an error if no endpoint is given', async function () {
      mockJwproxy.expects('command').never().called;
      await expect(driver.proxyCommand(null as any, 'POST', {some: 'stuff'})).to.be.rejectedWith(
        /endpoint/,
      );
    });
    it('should throw an error if no method is given', async function () {
      mockJwproxy.expects('command').never().called;
      await expect(
        driver.proxyCommand('/some/endpoint', null as any, {some: 'stuff'}),
      ).to.be.rejectedWith(/GET, POST/);
    });
    it('should throw an error if wda returns an error (even if http status is 200)', async function () {
      mockJwproxy.expects('command').once().returns({status: 13, value: 'WDA error occurred'});
      try {
        await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
      } catch (err) {
        expect(err.jsonwpCode).to.eql(13);
        expect(err.message).to.include('WDA error occurred');
        expect(err).to.be.an.instanceof(errors.UnknownError);
      }
    });
    it('should not throw an error if no status is returned', async function () {
      mockJwproxy.expects('command').once().returns({value: 'WDA error occurred'});
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
    });
  });
});
