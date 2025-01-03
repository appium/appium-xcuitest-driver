import {runSimulatorReset} from '../../lib/simulator-management.js';
import {XCUITestDriver} from '../../lib/driver';

describe('simulator management', function () {

  let chai;
  let should;

  before(async function () {
    chai = await import('chai');
    should = chai.should();
  });

  describe('runSimulatorReset', function () {
    let result;
    let driver;
    const stoppedDeviceDummy = {
      isRunning: () => false,
      scrubApp: (bundleId) => {
        result = {bundleId};
      },
      clean: () => {
        result = 'cleaned';
      },
      shutdown: () => {},
    };

    beforeEach(function () {
      result = undefined;
      driver = new XCUITestDriver();
    });

    it('should call scrubApp with fastReset', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false,
        fullReset: false,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      result.bundleId.should.eql('io.appium.example');
    });
    it('should return immediately with noReset', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: true,
        fullReset: false,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      should.equal(result, undefined);
    });
    it('should call clean with fullRest', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false,
        fullReset: true,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      result.should.eql('cleaned');
    });
    it('should not call scrubApp with fastReset and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false,
        fullReset: false,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      should.equal(result, undefined);
    });
    it('should return immediately with noReset and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: true,
        fullReset: false,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      should.equal(result, undefined);
    });
    it('should call clean with fullRest and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false,
        fullReset: true,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      result.should.eql('cleaned');
    });
    it('should not call scrubApp with fastReset, but no bundleid and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        noReset: false,
        fullReset: false,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      should.equal(result, undefined);
    });
  });
});
