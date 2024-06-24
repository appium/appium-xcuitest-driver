import {
  clearSystemFiles,
  translateDeviceName,
  markSystemFilesForCleanup,
  isLocalHost,
} from '../../lib/utils';
import {withMocks} from '@appium/test-support';
import {fs} from 'appium/support';
import * as iosUtils from '../../lib/utils';


const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';

describe('utils', function () {

  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  describe(
    'clearSystemFiles',
    withMocks({iosUtils, fs}, function (mocks) {
      afterEach(function () {
        mocks.verify();
      });
      it('should delete logs', async function () {
        const wda = {
          retrieveDerivedDataPath() {
            return DERIVED_DATA_ROOT;
          },
        };
        // @ts-ignore withMocks is wonky
        mocks.fs.expects('glob').once().returns([]);
        // @ts-ignore withMocks is wonky
        mocks.fs.expects('walkDir').once().returns();
        // @ts-ignore withMocks is wonky
        mocks.fs.expects('exists').atLeast(1).returns(true);
        // @ts-ignore withMocks is wonky
        mocks.iosUtils
          .expects('clearLogs')
          .once()
          .withExactArgs([`${DERIVED_DATA_ROOT}/Logs`])
          .returns();
        await clearSystemFiles(wda);
      });

      it('should only delete logs once if the same folder was marked twice for deletion', async function () {
        let wda = {
          retrieveDerivedDataPath() {
            return DERIVED_DATA_ROOT;
          },
        };
        // @ts-ignore withMocks is wonky
        mocks.fs.expects('glob').once().returns([]);
        // @ts-ignore withMocks is wonky
        mocks.fs.expects('walkDir').once().returns();
        // @ts-ignore withMocks is wonky
        mocks.fs.expects('exists').atLeast(1).returns(true);
        // @ts-ignore withMocks is wonky
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
        let wda = {
          retrieveDerivedDataPath() {
            return null;
          },
        };
        // @ts-ignore withMocks is wonky
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
      let deviceName = translateDeviceName('10.1.2', ipadDeviceName);
      // @ts-ignore should raises type error
      deviceName.should.equal('iPad Retina');
    });
    it('should set the correct iPad simulator generic device for iOS >= 10.3', function () {
      let deviceName = translateDeviceName('10.103', ipadDeviceName);
      // @ts-ignore should raises type error
      deviceName.should.equal('iPad Air');
      deviceName = translateDeviceName('10.3', ipadDeviceName);
      // @ts-ignore should raises type error
      deviceName.should.equal('iPad Air');
      deviceName = translateDeviceName('10.3', ipadDeviceName);
      // @ts-ignore should raises type error
      deviceName.should.equal('iPad Air');
    });
    it('should set the correct iPhone simulator generic device', function () {
      // @ts-ignore should raises type error
      translateDeviceName('0.0', iphoneDeviceName).should.equal('iPhone 6');
      // @ts-ignore should raises type error
      translateDeviceName('10.3', iphoneDeviceName).should.equal('iPhone 6');
    });
    it('should set the correct iPhone simulator generic device for simulators gte iOS 13.0', function () {
      // @ts-ignore should raises type error
      translateDeviceName('13.0', iphoneDeviceName).should.equal('iPhone X');
    });
    it('should set the default iPhone simulator to the highest generic device that is defined in ios-generic-simulators.js', function () {
      // The highest iOS version we define for iPhone in ios-generic-simulators.js is currently iOS 13.0
      // If this changes, update this test
      // @ts-ignore should raises type error
      translateDeviceName(outrageouslyHighIosVersion, iphoneDeviceName).should.equal('iPhone X');
    });
    it('should set the default iPad simulator to the lowest generic device that is defined in ios-generic-simulators.js for v0.0', function () {
      // The highest iOS version for iPad we define in ios-generic-simulators.js is currently iOS 10.3
      // If this changes, update this test
      // @ts-ignore should raises type error
      translateDeviceName('0.0', ipadDeviceName).should.equal('iPad Retina');
    });
    it('should set the default iPad simulator to the highest generic device that is defined in ios-generic-simulators.js for iOS < 13', function () {
      // The highest iOS version for iPad we define in ios-generic-simulators.js is currently iOS 10.3
      // If this changes, update this test
      // @ts-ignore should raises type error
      translateDeviceName('12.9', ipadDeviceName).should.equal('iPad Air');
    });
    it('should set the default iPad simulator to the highest generic device that is defined in ios-generic-simulators.js', function () {
      // The highest iOS version for iPad we define in ios-generic-simulators.js is currently iOS 10.3
      // If this changes, update this test
      // @ts-ignore should raises type error
      translateDeviceName(outrageouslyHighIosVersion, ipadDeviceName).should.equal(
        'iPad (5th generation)',
      );
    });
  });

  describe('isLocalHost', function () {
    it('should be false with invalid input, undefined', function () {
      // @ts-expect-error invalid input
      isLocalHost(undefined).should.be.false;
    });
    it('should be false with invalid input, empty', function () {
      // @ts-ignore should raises type error
      isLocalHost('').should.be.false;
    });
    it('should be true with ipv4 localhost', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://localhost').should.be.true;
    });
    it('should be true with ipv4 localhost with port', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://localhost:8888').should.be.true;
    });
    it('should be true with ipv4 127.0.0.1', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://127.0.0.1').should.be.true;
    });
    it('should be true with ipv6 ::1', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://[::1]').should.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://[::ffff:127.0.0.1]').should.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1 with port', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://[::ffff:127.0.0.1]:8888').should.be.true;
    });
    it('should be false with ipv4 192.168.1.100', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://192.168.1.100').should.be.false;
    });
    it('should be false with ipv4 192.168.1.100 with port', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://192.168.1.100:8888').should.be.false;
    });
    it('should be false with ipv6 2001:db8:85a3:8d3:1319:8a2e:370:7348', function () {
      // @ts-ignore should raises type error
      isLocalHost('http://[2001:db8:85a3:8d3:1319:8a2e:370:7348]').should.be.false;
    });
  });
});
