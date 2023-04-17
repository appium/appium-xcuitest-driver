import sinon from 'sinon';
import chai from 'chai';
import XCUITestDriver from '../../lib/driver';

chai.should();

describe('language and locale', function () {
  const LANGUAGE = 'en';
  const LOCALE = 'en_US';
  const BUNDLE_ID = 'com.test.app';
  const DEFAULT_CAPS = {
    elementResponseFields: undefined,
    disableAutomaticScreenshots: undefined,
    shouldUseCompactResponses: undefined,
    waitForIdleTimeout: undefined,
    shouldWaitForQuiescence: true,
    shouldUseTestManagerForVisibilityDetection: false,
    maxTypingFrequency: 60,
    shouldTerminateApp: true,
    forceAppLaunch: true,
    forceSimulatorSoftwareKeyboardPresence: true,
    useNativeCachingStrategy: true,
    shouldUseSingletonTestManager: true,
    eventloopIdleDelaySec: 0,
    environment: {},
  };

  describe('send only language and locale', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      const expectedWDACapabilities = {
        capabilities: {
          firstMatch: [
            Object.assign({}, DEFAULT_CAPS, {
              bundleId: BUNDLE_ID,
              arguments: [
                '-AppleLanguages',
                `(${LANGUAGE})`,
                '-NSLanguages',
                `(${LANGUAGE})`,
                '-AppleLocale',
                LOCALE,
              ],
            }),
          ],
          alwaysMatch: {},
        },
      };
      let desiredCapabilities =
        /** @type {import('@appium/types').DriverOpts<import('../../lib/driver').XCUITestDriverConstraints>} */ ({
          platformName: 'iOS',
          platformVersion: '9.3',
          deviceName: 'iPhone 6',
          app: 'testapp.app',
          language: LANGUAGE,
          locale: LOCALE,
          bundleId: BUNDLE_ID,
        });

      let driver = new XCUITestDriver(desiredCapabilities);
      let proxySpy = sinon.stub(driver, 'proxyCommand');
      driver.validateDesiredCaps(desiredCapabilities);
      await driver.startWdaSession(
        desiredCapabilities.bundleId,
        desiredCapabilities.processArguments
      );
      proxySpy.should.have.been.calledOnceWith('/session', 'POST', expectedWDACapabilities);
    });
  });

  describe('send process args, language and locale json', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      const processArguments = {
        args: ['a', 'b', 'c'],
        env: {a: 'b', c: 'd'},
      };

      const augmentedProcessArgumentsWithLanguage = {
        args: [
          ...processArguments.args,
          '-AppleLanguages',
          `(${LANGUAGE})`,
          '-NSLanguages',
          `(${LANGUAGE})`,
          '-AppleLocale',
          LOCALE,
        ],
        env: processArguments.env,
      };

      const expectedWDACapabilities = {
        capabilities: {
          firstMatch: [
            Object.assign({}, DEFAULT_CAPS, {
              bundleId: BUNDLE_ID,
              arguments: augmentedProcessArgumentsWithLanguage.args,
              environment: processArguments.env,
            }),
          ],
          alwaysMatch: {},
        },
      };

      const desiredCapabilities =
        /** @type {import('@appium/types').DriverOpts<import('../../lib/driver').XCUITestDriverConstraints>} */ ({
          platformName: 'iOS',
          platformVersion: '9.3',
          deviceName: 'iPhone 6',
          app: 'testapp.app',
          language: LANGUAGE,
          locale: LOCALE,
          bundleId: BUNDLE_ID,
          processArguments,
        });
      let driver = new XCUITestDriver(desiredCapabilities);
      let proxySpy = sinon.stub(driver, 'proxyCommand');
      driver.validateDesiredCaps(desiredCapabilities);
      await driver.startWdaSession(
        desiredCapabilities.bundleId,
        desiredCapabilities.processArguments
      );
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/session');
      proxySpy.firstCall.args[1].should.eql('POST');
      /** @type {any} */ (proxySpy.firstCall.args[2]).should.eql(expectedWDACapabilities);
    });
  });
});
