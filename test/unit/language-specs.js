import sinon from 'sinon';
import chai from 'chai';
import XCUITestDriver from '../..';

chai.should();

describe('language and locale', function () {
  const LANGUAGE = "en";
  const LOCALE = "en_US";

  describe('send only language and locale', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {

      const expectedWDACapabilities = {
        desiredCapabilities: {
          bundleId: "com.test.app",
          arguments: [
            '-AppleLanguages', `(${LANGUAGE})`,
            '-NSLanguages', `(${LANGUAGE})`,
            '-AppleLocale', LOCALE
          ],
          environment: {},
          shouldWaitForQuiescence: true,
          shouldUseTestManagerForVisibilityDetection: true,
          maxTypingFrequency: 60,
          shouldUseSingletonTestManager: true,
        }
      };
      let desiredCapabilities = {
        platformName: 'iOS',
        platformVersion: '9.3',
        deviceName: 'iPhone 6',
        app: "testapp.app",
        language: LANGUAGE,
        locale: LOCALE,
        bundleId: expectedWDACapabilities.desiredCapabilities.bundleId,
      };

      let driver = new XCUITestDriver(desiredCapabilities);
      let proxySpy = sinon.stub(driver, 'proxyCommand');
      driver.validateDesiredCaps(desiredCapabilities);
      await driver.startWdaSession(desiredCapabilities.bundleId, desiredCapabilities.processArguments);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/session');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql(expectedWDACapabilities);
    });
  });

  describe('send process args, language and locale json', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {

      let processArguments = {
        args: ["a", "b", "c"]
        , env: { "a": "b", "c": "d" }
      };

      let augmentedProcessArgumentsWithLanguage = {
        args: processArguments.args,
        env: processArguments.env
      };
      augmentedProcessArgumentsWithLanguage.args.push('-AppleLanguages', `(${LANGUAGE})`);
      augmentedProcessArgumentsWithLanguage.args.push('-NSLanguages', `(${LANGUAGE})`);
      augmentedProcessArgumentsWithLanguage.args.push('-AppleLocale', LOCALE);

      const expectedWDACapabilities = {
        desiredCapabilities: {
          bundleId: "com.test.app",
          arguments: augmentedProcessArgumentsWithLanguage.args,
          environment: processArguments.env,
          shouldWaitForQuiescence: true,
          shouldUseTestManagerForVisibilityDetection: true,
          maxTypingFrequency: 60,
          shouldUseSingletonTestManager: true,
        }
      };

      let desiredCapabilities = {
        platformName: 'iOS',
        platformVersion: '9.3',
        deviceName: 'iPhone 6',
        app: "testapp.app",
        language: LANGUAGE,
        locale: LOCALE,
        bundleId: expectedWDACapabilities.desiredCapabilities.bundleId,
        processArguments
      };
      let driver = new XCUITestDriver(desiredCapabilities);
      let proxySpy = sinon.stub(driver, 'proxyCommand');
      driver.validateDesiredCaps(desiredCapabilities);
      await driver.startWdaSession(desiredCapabilities.bundleId, desiredCapabilities.processArguments);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/session');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql(expectedWDACapabilities);
    });
  });
});
