import sinon from 'sinon';
import chai from 'chai';
import XCUITestDriver from '../..';

chai.should();

describe('language and locale', function () {
  const LANGUAGE = 'en';
  const LOCALE = 'en_US';
  const BUNDLE_ID = 'com.test.app';
  const DEFAULT_CAPS = {
    elementResponseFields: undefined,
    shouldUseCompactResponses: undefined,
    waitForIdleTimeout: undefined,
    shouldWaitForQuiescence: true,
    shouldUseTestManagerForVisibilityDetection: false,
    maxTypingFrequency: 60,
    shouldUseSingletonTestManager: true,
    eventloopIdleDelaySec: 0,
    environment: {},
  };

  describe('send only language and locale', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {

      const expectedWDACapabilities = {
        capabilities: {
          firstMatch: [Object.assign({}, DEFAULT_CAPS, {
            bundleId: BUNDLE_ID,
            arguments: [
              '-AppleLanguages', `(${LANGUAGE})`,
              '-NSLanguages', `(${LANGUAGE})`,
              '-AppleLocale', LOCALE
            ],
          })],
          alwaysMatch: {},
        }
      };
      let desiredCapabilities = {
        platformName: 'iOS',
        platformVersion: '9.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        language: LANGUAGE,
        locale: LOCALE,
        bundleId: BUNDLE_ID,
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
      const processArguments = {
        args: ['a', 'b', 'c'],
        env: { 'a': 'b', 'c': 'd' }
      };

      const augmentedProcessArgumentsWithLanguage = {
        args: [
          ...processArguments.args,
          '-AppleLanguages', `(${LANGUAGE})`,
          '-NSLanguages', `(${LANGUAGE})`,
          '-AppleLocale', LOCALE,
        ],
        env: processArguments.env
      };

      const expectedWDACapabilities = {
        capabilities: {
          firstMatch: [Object.assign({}, DEFAULT_CAPS, {
            bundleId: BUNDLE_ID,
            arguments: augmentedProcessArgumentsWithLanguage.args,
            environment: processArguments.env,
          })],
          alwaysMatch: {},
        }
      };

      const desiredCapabilities = {
        platformName: 'iOS',
        platformVersion: '9.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        language: LANGUAGE,
        locale: LOCALE,
        bundleId: BUNDLE_ID,
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
