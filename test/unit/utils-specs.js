import { clearSystemFiles, translateDeviceName, adjustWDAAttachmentsPermissions } from '../../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { utils as iosUtils } from 'appium-ios-driver';
import { fs } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

describe('utils', () => {
  const DERIVED_DATA_ROOT = '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll';
  describe('clearSystemFiles', withMocks({iosUtils}, (mocks) => {
    it('should delete logs', async () => {
      let wda = {};
      wda.retrieveDerivedDataPath = () => DERIVED_DATA_ROOT;
      mocks.iosUtils.expects('clearLogs')
        .once()
        .withExactArgs([`${DERIVED_DATA_ROOT}/Logs`])
        .returns();
      await clearSystemFiles(wda);
      mocks.iosUtils.verify();
    });
    it('should do nothing if no derived data path is found', async () => {
      let wda = {};
      wda.retrieveDerivedDataPath = () => null;
      mocks.iosUtils.expects('clearLogs')
        .never();
      await clearSystemFiles(wda);
      mocks.iosUtils.verify();
    });
  }));
  describe('adjustWDAAttachmentsPermissions', withMocks({fs}, (mocks) => {
    it('should change permissions to Attachments folder', async () => {
      let wda = {};
      wda.retrieveDerivedDataPath = () => DERIVED_DATA_ROOT;
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
    it('should do nothing if no derived data path is found', async () => {
      let wda = {};
      wda.retrieveDerivedDataPath = () => null;
      mocks.fs.expects('exists').never();
      mocks.fs.expects('chmod').never();
      await adjustWDAAttachmentsPermissions(wda, '777');
      mocks.fs.verify();
    });
  }));
  describe('determineDevice', () => {
    it('should set the correct iPad simultor generic device', async () => {
      let deviceName = await translateDeviceName("10.1.2", "iPad Simulator");
      deviceName.should.equal("iPad Retina");
      deviceName = await translateDeviceName(10.103, "iPad Simulator");
      deviceName.should.equal("iPad Retina");
      deviceName = await translateDeviceName("10.3", "iPad Simulator");
      deviceName.should.equal("iPad Air");
      deviceName = await translateDeviceName(10.3, "iPad Simulator");
      deviceName.should.equal("iPad Air");
      deviceName = await translateDeviceName(10.3, "iPhone Simulator");
      deviceName.should.equal("iPhone 6");
    });
  });
});
