import {
  clearSystemFiles, translateDeviceName, adjustWDAAttachmentsPermissions,
  markSystemFilesForCleanup } from '../../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { utils as iosUtils } from 'appium-ios-driver';
import { fs } from 'appium-support';
import B from 'bluebird';


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
  describe('adjustWDAAttachmentsPermissions', withMocks({fs}, function (mocks) {
    afterEach(function () {
      mocks.verify();
    });

    it('should change permissions to Attachments folder', async function () {
      let wda = {
        retrieveDerivedDataPath () {
          return DERIVED_DATA_ROOT;
        }
      };
      mocks.fs.expects('exists')
        .once()
        .withExactArgs(`${DERIVED_DATA_ROOT}/Logs/Test/Attachments`)
        .returns(true);
      mocks.fs.expects('chmod')
        .once()
        .withExactArgs(`${DERIVED_DATA_ROOT}/Logs/Test/Attachments`, '555')
        .returns();
      await adjustWDAAttachmentsPermissions(wda, '555');
    });
    it('should not repeat permissions change with equal flags for the particular folder', async function () {
      let wda = {
        retrieveDerivedDataPath () {
          return DERIVED_DATA_ROOT;
        }
      };
      mocks.fs.expects('exists')
        .atLeast(2)
        .withExactArgs(`${DERIVED_DATA_ROOT}/Logs/Test/Attachments`)
        .returns(true);
      mocks.fs.expects('chmod')
        .twice()
        .returns();
      await adjustWDAAttachmentsPermissions(wda, '333');
      await adjustWDAAttachmentsPermissions(wda, '333');
      await adjustWDAAttachmentsPermissions(wda, '444');
      await adjustWDAAttachmentsPermissions(wda, '444');
    });
    it('should not repeat permissions change with equal flags for the particular folder in parallel sessions', async function () {
      let wda = {
        retrieveDerivedDataPath () {
          return DERIVED_DATA_ROOT;
        }
      };
      mocks.fs.expects('exists')
        .atLeast(2)
        .withExactArgs(`${DERIVED_DATA_ROOT}/Logs/Test/Attachments`)
        .returns(true);
      mocks.fs.expects('chmod')
        .twice()
        .returns();
      await B.map([[wda, '123'], [wda, '123']], ([w, perms]) => adjustWDAAttachmentsPermissions(w, perms));
      await B.map([[wda, '234'], [wda, '234']], ([w, perms]) => adjustWDAAttachmentsPermissions(w, perms));
    });
    it('should do nothing if no derived data path is found', async function () {
      let wda = {
        retrieveDerivedDataPath () {
          return null;
        }
      };
      mocks.fs.expects('exists').never();
      mocks.fs.expects('chmod').never();
      await adjustWDAAttachmentsPermissions(wda, '777');
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
});
