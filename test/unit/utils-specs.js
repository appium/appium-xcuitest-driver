import {
  clearSystemFiles, translateDeviceName,
  markSystemFilesForCleanup, isLocalHost } from '../../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { utils as iosUtils } from 'appium-ios-driver';
import { fs } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';

describe('utils', function () {
  describe('clearSystemFiles', withMocks({iosUtils, fs}, function (mocks) {
    afterEach(function () {
      mocks.verify();
    });
    it('should delete logs', async function () {
      const wda = {
        retrieveDerivedDataPath () {
          return DERIVED_DATA_ROOT;
        }
      };
      mocks.fs.expects('exists')
        .once()
        .withExactArgs(`${DERIVED_DATA_ROOT}/Logs`)
        .returns(true);
      mocks.iosUtils.expects('clearLogs')
        .once()
        .withExactArgs([`${DERIVED_DATA_ROOT}/Logs`])
        .returns();
      await clearSystemFiles(wda);
    });

    it('should only delete logs once if the same folder was marked twice for deletion', async function () {
      let wda = {
        retrieveDerivedDataPath () {
          return DERIVED_DATA_ROOT;
        }
      };
      mocks.fs.expects('exists')
        .withExactArgs(`${DERIVED_DATA_ROOT}/Logs`)
        .returns(true);
      mocks.iosUtils.expects('clearLogs')
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
        retrieveDerivedDataPath () {
          return null;
        }
      };
      mocks.iosUtils.expects('clearLogs')
        .never();
      await clearSystemFiles(wda);
    });
  }));

  describe('determineDevice', function () {
    it('should set the correct iPad simulator generic device', function () {
      const ipadDeviceName = 'iPad Simulator';
      let deviceName = translateDeviceName('10.1.2', ipadDeviceName);
      deviceName.should.equal('iPad Retina');
      deviceName = translateDeviceName(10.103, ipadDeviceName);
      deviceName.should.equal('iPad Air');
      deviceName = translateDeviceName('10.3', ipadDeviceName);
      deviceName.should.equal('iPad Air');
      deviceName = translateDeviceName(10.3, ipadDeviceName);
      deviceName.should.equal('iPad Air');
    });
    it('should set the correct iPhone simulator generic device', function () {
      let deviceName = translateDeviceName(10.3, 'iPhone Simulator');
      deviceName.should.equal('iPhone 6');
    });
  });

  describe('isLocalHost', function () {
    it('should be false with invalid input, undefined', function () {
      isLocalHost(undefined).should.be.false;
    });
    it('should be false with invalid input, empty', function () {
      isLocalHost('').should.be.false;
    });
    it('should be true with ipv4 localhost', function () {
      isLocalHost('http://localhost').should.be.true;
    });
    it('should be true with ipv4 localhost with port', function () {
      isLocalHost('http://localhost:8888').should.be.true;
    });
    it('should be true with ipv4 127.0.0.1', function () {
      isLocalHost('http://127.0.0.1').should.be.true;
    });
    it('should be true with ipv6 ::1', function () {
      isLocalHost('http://[::1]').should.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1', function () {
      isLocalHost('http://[::ffff:127.0.0.1]').should.be.true;
    });
    it('should be true with ipv6 ::ffff:127.0.0.1 with port', function () {
      isLocalHost('http://[::ffff:127.0.0.1]:8888').should.be.true;
    });
    it('should be false with ipv4 192.168.1.100', function () {
      isLocalHost('http://192.168.1.100').should.be.false;
    });
    it('should be false with ipv4 192.168.1.100 with port', function () {
      isLocalHost('http://192.168.1.100:8888').should.be.false;
    });
    it('should be false with ipv6 2001:db8:85a3:8d3:1319:8a2e:370:7348', function () {
      isLocalHost('http://[2001:db8:85a3:8d3:1319:8a2e:370:7348]').should.be.false;
    });
  });
});
