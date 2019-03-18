import { getXctestrunFilePath } from '../../../lib/wda/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks } from 'appium-test-support';
import { fs } from 'appium-support';
import path from 'path';
import { fail } from 'assert';

chai.should();
chai.use(chaiAsPromised);

describe('utils', function () {
  describe('#getXctestrunFilePath', withMocks({fs}, function (mocks) {
    const platformVersion = '12.0';
    const sdkVersion = '12.2';
    const udid = 'xxxxxyyyyyyzzzzzz';
    const bootstrapPath = 'path/to/data';

    afterEach(function () {
      mocks.verify();
    });

    it('should return sdk based path with udid', async function () {
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`))
        .returns(true);
      mocks.fs.expects('copyFile')
        .never();
      const deviceInfo = {isRealDevice: true, udid, platformVersion};
      await getXctestrunFilePath(deviceInfo, sdkVersion, bootstrapPath)
        .should.eventually.equal(path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`));
    });

    it('should return sdk based path without udid, copy them', async function () {
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`))
        .returns(false);
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphoneos${sdkVersion}-arm64.xctestrun`))
        .returns(true);
      mocks.fs.expects('copyFile')
        .withExactArgs(
          path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphoneos${sdkVersion}-arm64.xctestrun`),
          path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`)
        )
        .returns(true);
      const deviceInfo = {isRealDevice: true, udid, platformVersion};
      await getXctestrunFilePath(deviceInfo, sdkVersion, bootstrapPath)
        .should.eventually.equal(path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`));
    });

    it('should return platform based path', async function () {
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`))
        .returns(false);
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphonesimulator${sdkVersion}-x86_64.xctestrun`))
        .returns(false);
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/${udid}_${platformVersion}.xctestrun`))
        .returns(true);
      mocks.fs.expects('copyFile')
        .never();
      const deviceInfo = {isRealDevice: false, udid, platformVersion};
      await getXctestrunFilePath(deviceInfo, sdkVersion, bootstrapPath)
        .should.eventually.equal(path.resolve(`${bootstrapPath}/${udid}_${platformVersion}.xctestrun`));
    });

    it('should return platform based path without udid, copy them', async function () {
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/${udid}_${sdkVersion}.xctestrun`))
        .returns(false);
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphonesimulator${sdkVersion}-x86_64.xctestrun`))
        .returns(false);
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/${udid}_${platformVersion}.xctestrun`))
        .returns(false);
      mocks.fs.expects('exists')
        .withExactArgs(path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphonesimulator${platformVersion}-x86_64.xctestrun`))
        .returns(true);
      mocks.fs.expects('copyFile')
        .withExactArgs(
          path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphonesimulator${platformVersion}-x86_64.xctestrun`),
          path.resolve(`${bootstrapPath}/${udid}_${platformVersion}.xctestrun`)
        )
        .returns(true);

      const deviceInfo = {isRealDevice: false, udid, platformVersion};
      await getXctestrunFilePath(deviceInfo, sdkVersion, bootstrapPath)
        .should.eventually.equal(path.resolve(`${bootstrapPath}/${udid}_${platformVersion}.xctestrun`));
    });

    it('should raise an exception because of no files', async function () {
      const expected = path.resolve(`${bootstrapPath}/WebDriverAgentRunner_iphonesimulator${sdkVersion}-x86_64.xctestrun`);
      mocks.fs.expects('exists').exactly(4).returns(false);

      const deviceInfo = {isRealDevice: false, udid, platformVersion};
      try {
        await getXctestrunFilePath(deviceInfo, sdkVersion, bootstrapPath);
        fail();
      } catch (err) {
        err.message.should.equal(`If you are using 'useXctestrunFile' capability then you need to have a xctestrun file (expected: '${expected}')`);
      }
    });
  }));
});
