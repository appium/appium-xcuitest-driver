import {runSimulatorReset} from '../../lib/device/simulator-management';
import {XCUITestDriver} from '../../lib/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('simulator management', function () {

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
      driver = new XCUITestDriver({} as any);
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
      expect(result.bundleId).to.eql('io.appium.example');
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
      expect(result, undefined);
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
      expect(result).to.eql('cleaned');
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
      expect(result, undefined);
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
      expect(result, undefined);
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
      expect(result).to.eql('cleaned');
    });
    it('should not call scrubApp with fastReset, but no bundleid and app', async function () {
      driver.opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        noReset: false,
        fullReset: false,
      };
      driver._device = stoppedDeviceDummy;
      await runSimulatorReset.bind(driver)();
      expect(result, undefined);
    });
  });
});
