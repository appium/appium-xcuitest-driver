import sinon from 'sinon';
import _ from 'lodash';
import {XCUITestDriver} from '../../lib/driver';
import {expect} from 'chai';


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
    appLaunchStateTimeoutSec: undefined,
    environment: {},
  };


  let mockDriver;
  before(async function () {
    const chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    chai.use(chaiAsPromised.default);
  });

  afterEach(function () {
    if (mockDriver) {
      mockDriver.verify();
    }
  });

  describe('send only language and locale', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      const expectedWDACapabilities = {
        capabilities: {
          firstMatch: [
            {
              ...DEFAULT_CAPS,
              bundleId: BUNDLE_ID,
              arguments: [
                '-AppleLanguages',
                `(${LANGUAGE})`,
                '-NSLanguages',
                `(${LANGUAGE})`,
                '-AppleLocale',
                LOCALE,
              ],
            },
          ],
          alwaysMatch: {},
        },
      };
      const desiredCapabilities: any = {
        platformName: 'iOS',
        platformVersion: '9.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        language: LANGUAGE,
        locale: LOCALE,
        bundleId: BUNDLE_ID,
      };

      const driver = new XCUITestDriver(desiredCapabilities);

      mockDriver = sinon.mock(driver);
      mockDriver.expects('proxyCommand').once().withExactArgs('/session', 'POST', expectedWDACapabilities);

      driver.validateDesiredCaps(desiredCapabilities);
      await driver.startWdaSession(
        desiredCapabilities.bundleId,
        desiredCapabilities.processArguments,
      );
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

      const expectedProcessArguments = _.cloneDeep(processArguments);
      const expectedWDACapabilities = {
        capabilities: {
          firstMatch: [
            {...DEFAULT_CAPS,
              bundleId: BUNDLE_ID,
              arguments: augmentedProcessArgumentsWithLanguage.args,
              environment: processArguments.env,
            },
          ],
          alwaysMatch: {},
        },
      };

      const desiredCapabilities: any = {
        platformName: 'iOS',
        platformVersion: '9.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        language: LANGUAGE,
        locale: LOCALE,
        bundleId: BUNDLE_ID,
        processArguments,
      };
      const driver = new XCUITestDriver(desiredCapabilities);

      mockDriver = sinon.mock(driver);
      mockDriver.expects('proxyCommand').once().withExactArgs('/session', 'POST', expectedWDACapabilities);

      driver.validateDesiredCaps(desiredCapabilities);
      await driver.startWdaSession(
        desiredCapabilities.bundleId,
        desiredCapabilities.processArguments,
      );
      expect(desiredCapabilities.processArguments).to.eql(expectedProcessArguments);
    });
  });
});
