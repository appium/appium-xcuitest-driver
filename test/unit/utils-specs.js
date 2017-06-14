import { clearSystemFiles, translateDeviceName } from '../../lib/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { utils as iosUtils } from 'appium-ios-driver';


chai.should();
chai.use(chaiAsPromised);

describe('utils', () => {
  describe('clearSystemFiles', withMocks({iosUtils}, (mocks) => {
    it('should delete logs', async () => {
      let wda = {
        derivedDataPath: '/path/to/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll',
      };
      mocks.iosUtils.expects('clearLogs')
        .once()
        .withExactArgs([`${wda.derivedDataPath}/Logs`])
        .returns();
      await clearSystemFiles(wda);
      mocks.iosUtils.verify();
    });
    it('should do nothing if no derived data path is found', async () => {
      let wda = {};
      mocks.iosUtils.expects('clearLogs')
        .never();
      await clearSystemFiles(wda);
      mocks.iosUtils.verify();
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
