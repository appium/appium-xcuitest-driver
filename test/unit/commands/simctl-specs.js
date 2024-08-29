import sinon from 'sinon';
import _ from 'lodash';
import XCUITestDriver from '../../../lib/driver';
import Simctl from 'node-simctl';


describe('general commands', function () {
  const driver = new XCUITestDriver();
  const simctl = new Simctl();
  driver._device = { simctl }

  let chai;
  let mockSimctl;
  let device;

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
      console.log(device)
      driver.isFeatureEnabled = () => true;
      mockSimctl.expects('exec').once().withExactArgs('list', { args: [ 'devices', 'booted', '--json' ]});
      await driver.mobileSimctl('list', ['devices', 'booted', '--json']);
    });

    it('should raise an error as not allowed', async function () {
      driver.isFeatureEnabled = () => false;
      mockSimctl.expects('exec').never();
      await driver.mobileSimctl('list', ['devices', 'booted', '--json']).should.eventually.be.rejected;
    });
  });
});
