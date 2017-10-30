import { clearSystemFiles, translateDeviceName, adjustWDAAttachmentsPermissions,
         markSystemFilesForCleanup } from '../../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { utils as iosUtils } from 'appium-ios-driver';
import { fs } from 'appium-support';
import B from 'bluebird';


chai.should();
chai.use(chaiAsPromised);

describe('utils', () => {
  const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';
  describe('clearSystemFiles', withMocks({iosUtils, fs}, (mocks) => {
    it('should delete logs', async () => {
      let wda = {
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
      mocks.fs.verify();
      mocks.iosUtils.verify();
    });
    it('should only delete logs once if the same folder was marked twice for deletion', async () => {
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
      mocks.fs.verify();
      mocks.iosUtils.verify();
    });
    it('should do nothing if no derived data path is found', async () => {
      let wda = {
        retrieveDerivedDataPath () {
          return null;
        }
      };
      mocks.iosUtils.expects('clearLogs')
        .never();
      await clearSystemFiles(wda);
      mocks.iosUtils.verify();
    });
  }));
  describe('adjustWDAAttachmentsPermissions', withMocks({fs}, (mocks) => {
    it('should change permissions to Attachments folder', async () => {
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
      mocks.fs.verify();
    });
    it('should not repeat permissions change with equal flags for the particular folder', async () => {
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
      mocks.fs.verify();
    });
    it('should not repeat permissions change with equal flags for the particular folder in parallel sessions', async () => {
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
      mocks.fs.verify();
    });
    it('should do nothing if no derived data path is found', async () => {
      let wda = {
        retrieveDerivedDataPath () {
          return null;
        }
      };
      mocks.fs.expects('exists').never();
      mocks.fs.expects('chmod').never();
      await adjustWDAAttachmentsPermissions(wda, '777');
      mocks.fs.verify();
    });
  }));
  describe('determineDevice', () => {
    const XCODE8 = {versionFloat: 8.3};
    const XCODE9_0 = {versionFloat: 9.0};
    const XCODE9_1 = {versionFloat: 9.1};
    const XCODE10 = {versionFloat: 10.0};

    it('should set the correct iPad simulator generic device', async function () {
      const ipadDeviceName = 'iPad Simulator';
      let deviceName = await translateDeviceName(XCODE8, "10.1.2", ipadDeviceName);
      deviceName.should.equal("iPad Retina");
      deviceName = await translateDeviceName(XCODE10, 10.103, ipadDeviceName);
      deviceName.should.equal("iPad Retina");
      deviceName = await translateDeviceName(XCODE9_1, "10.3", ipadDeviceName);
      deviceName.should.equal("iPad Air");
      deviceName = await translateDeviceName(XCODE9_0, 10.3, ipadDeviceName);
      deviceName.should.equal("iPad Air");
    });
    it('should set the correct iPhone simulator generic device', async function () {
      let deviceName = await translateDeviceName(XCODE8, 10.3, "iPhone Simulator");
      deviceName.should.equal("iPhone 6");
    });
    it('should set the correct device name for iPhone 8', async function () {
      const testData = [
        {
          xcodeVersion: XCODE8,
          platformVersion: "10.1.2",
          actualName: "iPhone 8",
          expectedName: "iPhone2017-A"
        },
        {
          xcodeVersion: XCODE9_0,
          platformVersion: "10.1.2",
          actualName: "iPhone 8",
          expectedName: "iPhone2017-A"
        },
        {
          xcodeVersion: XCODE9_1,
          platformVersion: "10.1.2",
          actualName: "iPhone 8",
          expectedName: "iPhone 8"
        },
        {
          xcodeVersion: XCODE10,
          platformVersion: "10.1.2",
          actualName: "iPhone 8",
          expectedName: "iPhone 8"
        },
      ];
      for (const {xcodeVersion, platformVersion, actualName, expectedName} of testData) {
        const deviceName = await translateDeviceName(xcodeVersion, platformVersion, actualName);
        deviceName.should.equal(expectedName);
      }
    });
    it('should set the correct device name for iPhone 8 Plus', async function () {
      const testData = [
        {
          xcodeVersion: XCODE8,
          platformVersion: "10.1.2",
          actualName: "iPhone 8 PLus",
          expectedName: "iPhone2017-B"
        },
        {
          xcodeVersion: XCODE9_0,
          platformVersion: "10.1.2",
          actualName: "iPhone 8 PLus",
          expectedName: "iPhone2017-B"
        },
        {
          xcodeVersion: XCODE9_1,
          platformVersion: "10.1.2",
          actualName: "iPhone 8 PLus",
          expectedName: "iPhone 8 Plus"
        },
        {
          xcodeVersion: XCODE10,
          platformVersion: "10.1.2",
          actualName: "iPhone 8 PLus",
          expectedName: "iPhone 8 Plus"
        },
      ];
      for (const {xcodeVersion, platformVersion, actualName, expectedName} of testData) {
        const deviceName = await translateDeviceName(xcodeVersion, platformVersion, actualName);
        deviceName.should.equal(expectedName);
      }
    });
    it('should set the correct device name for iPhone X', async function () {
      const testData = [
        {
          xcodeVersion: XCODE8,
          platformVersion: "10.1.2",
          actualName: "iPhone x",
          expectedName: "iPhone2017-C"
        },
        {
          xcodeVersion: XCODE9_0,
          platformVersion: "10.1.2",
          actualName: "iPhone X",
          expectedName: "iPhone2017-C"
        },
        {
          xcodeVersion: XCODE9_1,
          platformVersion: "10.1.2",
          actualName: "iphone x",
          expectedName: "iPhone X"
        },
        {
          xcodeVersion: XCODE10,
          platformVersion: "10.1.2",
          actualName: "iPhone X",
          expectedName: "iPhone X"
        },
      ];
      for (const {xcodeVersion, platformVersion, actualName, expectedName} of testData) {
        const deviceName = await translateDeviceName(xcodeVersion, platformVersion, actualName);
        deviceName.should.equal(expectedName);
      }
    });
  });
});
