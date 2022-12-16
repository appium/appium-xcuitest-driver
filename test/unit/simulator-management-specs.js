import { runSimulatorReset } from '../../lib/simulator-management.js';
import chai from 'chai';

const should = chai.should();

describe('simulator management', function () {
  describe('runSimulatorReset', function () {
    let result;
    const stoppedDeviceDummy = {
      isRunning: () => false,
      scrubApp: (bundleId) => {
        result = {bundleId};
      },
      clean: () => {
        result = 'cleaned';
      },
      shutdown: () => {}
    };

    beforeEach(function () {
      result = undefined;
    });

    it('should call scrubApp with fastReset', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      result.bundleId.should.eql('io.appium.example');
    });
    it('should return immediately with noReset', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: true, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
    it('should call clean with fullRest', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        noReset: false, fullReset: true
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      result.should.eql('cleaned');
    });
    it('should not call scrubApp with fastReset and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
    it('should return immediately with noReset and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: true, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
    it('should call clean with fullRest and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        bundleId: 'io.appium.example',
        app: 'path/to/app.app',
        noReset: false, fullReset: true
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      result.should.eql('cleaned');
    });
    it('should not call scrubApp with fastReset, but no bundleid and app', async function () {
      const opts = {
        udid: '301CD634-00A9-4042-B463-BD4E755167EA',
        noReset: false, fullReset: false
      };
      await runSimulatorReset(stoppedDeviceDummy, opts);
      should.equal(result, undefined);
    });
  });
});
