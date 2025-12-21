import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {Simctl} from 'node-simctl';
import {expect} from 'chai';


describe('general commands', function () {
  const driver = new XCUITestDriver({} as any);
  const simctl = new Simctl();
  driver._device = { simctl } as any;

  let mockSimctl;

  beforeEach(function () {
    mockSimctl = sinon.mock((driver.device as any).simctl);
  });

  afterEach(function () {
    mockSimctl.verify();
  });

  describe('simctl', function () {
    it('should call xcrun simctl', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').once().withExactArgs(
        'getenv',
        {args: ['60EB8FDB-92E0-4895-B466-0153C6DE7BAE', 'HOME'], timeout: undefined}
      ).returns(Promise.resolve({stdout: '', stderr: '', code: 0}));
      await driver.mobileSimctl('getenv', ['HOME']);
    });

    it('should call xcrun simctl with timeout', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').once().withExactArgs(
        'getenv',
        {args: ['60EB8FDB-92E0-4895-B466-0153C6DE7BAE', 'HOME'], timeout: 10000}
      ).returns(Promise.resolve({stdout: '', stderr: '', code: 0}));
      await driver.mobileSimctl('getenv', ['HOME'], 10000);
    });

    it('should raise an error as not supported command', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').never();
      await expect(driver.mobileSimctl(
        'list',
        ['devices', 'booted', '--json']
      )).to.eventually.be.rejected;
    });

    it('should raise an error as no udid', async function () {
      driver.opts.udid = undefined;
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').never();
      await expect(driver.mobileSimctl(
        'getenv', ['HOME']
      )).to.eventually.be.rejected;
    });

    it('should raise an error for non-simulator', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => false;
      mockSimctl.expects('exec').never();
      await expect(driver.mobileSimctl(
        'getenv', ['HOME']
      )).to.eventually.be.rejected;
    });
  });
});
