import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';
import Simctl from 'node-simctl';


describe('general commands', function () {
  const driver = new XCUITestDriver();
  const simctl = new Simctl();
  driver._device = { simctl };

  let chai;
  let mockSimctl;

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  beforeEach(function () {
    mockSimctl = sinon.mock(driver.device.simctl);
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
      );
      await driver.mobileSimctl('getenv', ['HOME']);
    });

    it('should call xcrun simctl with timeout', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').once().withExactArgs(
        'getenv',
        {args: ['60EB8FDB-92E0-4895-B466-0153C6DE7BAE', 'HOME'], timeout: 10000}
      );
      await driver.mobileSimctl('getenv', ['HOME'], 10000);
    });

    it('should raise an error as not supported command', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').never();
      await driver.mobileSimctl(
        'list',
        ['devices', 'booted', '--json']
      ).should.eventually.be.rejected;
    });

    it('should raise an error as no udid', async function () {
      driver.opts.udid = null;
      driver.isSimulator = () => true;
      mockSimctl.expects('exec').never();
      await driver.mobileSimctl(
        'getenv', ['HOME']
      ).should.eventually.be.rejected;
    });

    it('should raise an error for non-simulator', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => false;
      mockSimctl.expects('exec').never();
      await driver.mobileSimctl(
        'getenv', ['HOME']
      ).should.eventually.be.rejected;
    });
  });
});
