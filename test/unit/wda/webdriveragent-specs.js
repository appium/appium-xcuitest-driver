import { WebDriverAgent } from '../../../lib/wda/webdriveragent';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { fs } from 'appium-support';
const appium_wda = require('appium-webdriveragent');

chai.should();
chai.use(chaiAsPromised);

describe('WebDriverAgent', function () {
  const wda = new WebDriverAgent('12.1');
  const wda_xcodebuild = wda.xcodebuild;
  describe('#launch', withMocks({wda, fs, appium_wda, wda_xcodebuild}, function (mocks) {

    afterEach(function () {
      mocks.verify();
    });

    it('should call checkForDependencies', async function () {
      wda.useXctestrunFile = false;
      wda.usePrebuiltWDA = false;
      wda.derivedDataPath = undefined;
      wda.device = {};
      wda.device.udid = 'udid';

      mocks.wda.expects('setupProxies').once().returns();
      mocks.fs.expects('exists').returns(true);
      mocks.appium_wda.expects('checkForDependencies').once().returns(false);
      mocks.wda_xcodebuild.expects('init').once().returns();
      mocks.wda_xcodebuild.expects('start').once().returns();
      await wda.launch();
    });

    it('should call checkForDependencies since only usePrebuiltWDA', async function () {
      wda.useXctestrunFile = false;
      wda.usePrebuiltWDA = true;
      wda.derivedDataPath = undefined;
      wda.device = {};
      wda.device.udid = 'udid';

      mocks.wda.expects('setupProxies').once().returns();
      mocks.fs.expects('exists').returns(true);
      mocks.appium_wda.expects('checkForDependencies').once().returns(false);
      mocks.wda_xcodebuild.expects('init').once().returns();
      mocks.wda_xcodebuild.expects('start').once().returns();
      await wda.launch();
    });

    it('should not call checkForDependencies with usePrebuiltWDA and derivedDataPath', async function () {
      wda.useXctestrunFile = false;
      wda.usePrebuiltWDA = true;
      wda.derivedDataPath = 'path/to/data';
      wda.device = {};
      wda.device.udid = 'udid';

      mocks.wda.expects('setupProxies').once().returns();
      mocks.fs.expects('exists').returns(true);
      mocks.appium_wda.expects('checkForDependencies').never();
      mocks.wda_xcodebuild.expects('init').once().returns();
      mocks.wda_xcodebuild.expects('start').once().returns();
      await wda.launch();
    });

    it('should not call checkForDependencies with useXctestrunFile', async function () {
      wda.useXctestrunFile = true;
      wda.usePrebuiltWDA = false;
      wda.derivedDataPath = undefined;
      wda.device = {};
      wda.device.udid = 'udid';

      mocks.wda.expects('setupProxies').once().returns();
      mocks.fs.expects('exists').returns(true);
      mocks.appium_wda.expects('checkForDependencies').never();
      mocks.wda_xcodebuild.expects('init').once().returns();
      mocks.wda_xcodebuild.expects('start').once().returns();
      await wda.launch();
    });
  }));
});
