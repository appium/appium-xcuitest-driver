import {
  clearSystemFiles,
  translateDeviceName,
  markSystemFilesForCleanup,
  isLocalHost,
} from '../../lib/utils';
import {withMocks} from '@appium/test-support';
import {fs} from 'appium/support';
import * as iosUtils from '../../lib/utils';
import {expect} from 'chai';


const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';

describe('utils', function () {

  before(async function () {
    const chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    chai.use(chaiAsPromised.default);
  });

  describe(
    'clearSystemFiles',
    withMocks({iosUtils, fs}, function (mocks: any) {
      afterEach(function () {
        mocks.verify();
      });
      it('should delete logs', async function () {
        const wda = {
          retrieveDerivedDataPath() {
            return DERIVED_DATA_ROOT;
          },
        };
        mocks.fs.expects('glob').once().returns([]);
        mocks.fs.expects('walkDir').once().returns();
        mocks.fs.expects('exists').atLeast(1).returns(true);
        mocks.iosUtils
          .expects('clearLogs')
          .once()
          .withExactArgs([`${DERIVED_DATA_ROOT}/Logs`])
          .returns();
        await clearSystemFiles(wda);
      });

      it('should only delete logs once if the same folder was marked twice for deletion', async function () {
        const wda = {
          retrieveDerivedDataPath() {
            return DERIVED_DATA_ROOT;
          },
        };
        mocks.fs.expects('glob').once().returns([]);
        mocks.fs.expects('walkDir').once().returns();
        mocks.fs.expects('exists').atLeast(1).returns(true);
        mocks.iosUtils
          .expects('clearLogs')
          .once()
          .withExactArgs([`${DERIVED_DATA_ROOT}/Logs`])
          .returns();
        await markSystemFilesForCleanup(wda);
        await markSystemFilesForCleanup(wda);
        await clearSystemFiles(wda);
        await clearSystemFiles(wda);
      });
      it('should do nothing if no derived data path is found', async function () {
        const wda = {
          retrieveDerivedDataPath() {
            return null;
          },
        };
        mocks.iosUtils.expects('clearLogs').never();
        await clearSystemFiles(wda);
      });
    }),
  );

  describe('determineDevice', function () {
    const ipadDeviceName = 'iPad Simulator';
    const iphoneDeviceName = 'iPhone Simulator';
    const outrageouslyHighIosVersion = '999999.999999';

    it('should set the correct iPad simulator generic device', function () {
      const deviceName = translateDeviceName('10.1.2', ipadDeviceName);
      expect(deviceName).to.equal('iPad Retina');
    });
    it('should set the correct iPad simulator generic device for iOS >= 10.3', function () {
      let deviceName = translateDeviceName('10.103', ipadDeviceName);
      expect(deviceName).to.equal('iPad Air');
      deviceName = translateDeviceName('10.3', ipadDeviceName);
      expect(deviceName).to.equal('iPad Air');
      deviceName = translateDeviceName('10.3', ipadDeviceName);
      expect(deviceName).to.equal('iPad Air');
    });
    it('should set the correct iPhone simulator generic device', function () {
      expect(translateDeviceName('0.0', iphoneDeviceName)).to.equal('iPhone 6');
      expect(translateDeviceName('10.3', iphoneDeviceName)).to.equal('iPhone 6');
    });
    it('should set the correct iPhone simulator generic device for simulators gte iOS 13.0', function () {
      expect(translateDeviceName('13.0', iphoneDeviceName)).to.equal('iPhone X');
    });
    it('should set the default iPhone simulator to the highest generic device that is defined in ios-generic-simulators.js', function () {
      // The highest iOS version we define for iPhone in ios-generic-simulators.js is currently iOS 13.0
      // If this changes, update this test
      expect(translateDeviceName(outrageouslyHighIosVersion, iphoneDeviceName)).to.equal('iPhone X');
    });
    it('should set the default iPad simulator to the lowest generic device that is defined in ios-generic-simulators.js for v0.0', function () {
      // The highest iOS version for iPad we define in ios-generic-simulators.js is currently iOS 10.3
      // If this changes, update this test
      expect(translateDeviceName('0.0', ipadDeviceName)).to.equal('iPad Retina');
    });
    it('should set the default iPad simulator to the highest generic device that is defined in ios-generic-simulators.js for iOS < 13', function () {
      // The highest iOS version for iPad we define in ios-generic-simulators.js is currently iOS 10.3
      // If this changes, update this test
      expect(translateDeviceName('12.9', ipadDeviceName)).to.equal('iPad Air');
    });
    it('should set the default iPad simulator to the highest generic device that is defined in ios-generic-simulators.js', function () {
      // The highest iOS version for iPad we define in ios-generic-simulators.js is currently iOS 10.3
      // If this changes, update this test
      expect(translateDeviceName(outrageouslyHighIosVersion, ipadDeviceName)).to.equal(
        'iPad (5th generation)',
      );
    });
  });

  describe('isLocalHost', function () {
    it('should be false with invalid input, undefined', function () {
      // @ts-expect-error invalid input
      expect(isLocalHost(undefined)).to.be.false;
    });
    it('should be false with invalid input, empty', function () {
      expect(isLocalHost('')).to.be.false;
    });
    it('should be true with ipv4 localhost', function () {
      expect(isLocalHost('http://localhost')).to.be.true;
    });
    it('should be true with ipv4 localhost with port', function () {
      expect(isLocalHost('http://localhost:8888')).to.be.true;
    });
    it('should be true with ipv4 127.0.0.1', function () {
      expect(isLocalHost('http://127.0.0.1')).to.be.true;
    });
    it('should be true with ipv6 ::1', function () {
      expect(isLocalHost('http://[::1]')).to.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1', function () {
      expect(isLocalHost('http://[::ffff:127.0.0.1]')).to.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1 with port', function () {
      expect(isLocalHost('http://[::ffff:127.0.0.1]:8888')).to.be.true;
    });
    it('should be false with ipv4 192.168.1.100', function () {
      expect(isLocalHost('http://192.168.1.100')).to.be.false;
    });
    it('should be false with ipv4 192.168.1.100 with port', function () {
      expect(isLocalHost('http://192.168.1.100:8888')).to.be.false;
    });
    it('should be false with ipv6 2001:db8:85a3:8d3:1319:8a2e:370:7348', function () {
      expect(isLocalHost('http://[2001:db8:85a3:8d3:1319:8a2e:370:7348]')).to.be.false;
    });
  });
});
