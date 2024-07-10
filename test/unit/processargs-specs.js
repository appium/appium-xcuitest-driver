import sinon from 'sinon';
import XCUITestDriver from '../../lib/driver';


describe('process args', function () {
  const BUNDLE_ID = 'com.test.app';
  let driver = new XCUITestDriver();
  driver.opts.platformVersion = '10.3';
  let mockDriver;
  const DEFAULT_CAPS = {
    elementResponseFields: undefined,
    disableAutomaticScreenshots: undefined,
    shouldUseCompactResponses: undefined,
    waitForIdleTimeout: undefined,
    shouldWaitForQuiescence: true,
    shouldUseTestManagerForVisibilityDetection: false,
    maxTypingFrequency: 60,
    forceAppLaunch: true,
    forceSimulatorSoftwareKeyboardPresence: true,
    useNativeCachingStrategy: true,
    shouldTerminateApp: true,
    shouldUseSingletonTestManager: true,
    appLaunchStateTimeoutSec: undefined,
    eventloopIdleDelaySec: 0,
  };

  const PROCESS_ARGS_OBJECT = {
    args: ['a', 'b', 'c'],
    env: {a: 'b', c: 'd'},
  };

  let processArgsString = JSON.stringify(PROCESS_ARGS_OBJECT);

  let desired = {
    capabilities: {
      firstMatch: [
        Object.assign({}, DEFAULT_CAPS, {
          bundleId: BUNDLE_ID,
          arguments: PROCESS_ARGS_OBJECT.args,
          environment: PROCESS_ARGS_OBJECT.env,
        }),
      ],
      alwaysMatch: {},
    },
  };

  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('send process args as object', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/session', 'POST', desired);

      let desiredWithProArgsObject = {
        platformName: 'iOS',
        platformVersion: '10.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        bundleId: BUNDLE_ID,
        processArguments: PROCESS_ARGS_OBJECT,
      };
      driver.validateDesiredCaps(desiredWithProArgsObject);
      await driver.startWdaSession(
        desiredWithProArgsObject.bundleId,
        desiredWithProArgsObject.processArguments,
      );
    });
  });

  describe('send process args json string', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/session', 'POST', desired);

      let desiredWithProArgsString = {
        platformName: 'iOS',
        platformVersion: '10.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        bundleId: BUNDLE_ID,
        processArguments: processArgsString,
      };
      driver.validateDesiredCaps(desiredWithProArgsString);
      await driver.startWdaSession(
        desiredWithProArgsString.bundleId,
        desiredWithProArgsString.processArguments,
      );
    });
  });
});
