import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {startWdaSession} from '../../lib/commands/wda/startup.js';
import {XCUITestDriver} from '../../lib/driver.js';

describe('application under test', function () {
  const BUNDLE_ID = 'com.test.app';
  const DEFAULT_CAPS = {
    arguments: [],
    environment: {},
    elementResponseFields: undefined,
    disableAutomaticScreenshots: undefined,
    shouldUseCompactResponses: undefined,
    waitForIdleTimeout: undefined,
    shouldWaitForQuiescence: true,
    maxTypingFrequency: 60,
    forceAppLaunch: true,
    forceSimulatorSoftwareKeyboardPresence: true,
    useNativeCachingStrategy: true,
    shouldTerminateApp: true,
    shouldUseSingletonTestManager: true,
    appLaunchStateTimeoutSec: undefined,
    eventloopIdleDelaySec: 0,
  };
  let driver: XCUITestDriver;
  let mockDriver: sinon.SinonMock;

  const expectWdaCaps = (wdaCaps: Record<string, any>) =>
    mockDriver
      .expects('proxyCommand')
      .once()
      .withExactArgs('/session', 'POST', {
        capabilities: {
          firstMatch: [{...DEFAULT_CAPS, ...wdaCaps}],
          alwaysMatch: {},
        },
      });

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    driver.opts.platformVersion = '17.0';
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  it('should not pass the bundle id to WDA if autoLaunch is disabled', async function () {
    driver.opts.autoLaunch = false;
    expectWdaCaps({bundleId: undefined});
    await startWdaSession.call(driver, BUNDLE_ID);
  });

  it('should pass the bundle id to WDA without launching the app if autoLaunch is disabled and forceAppUnderTest is enabled', async function () {
    driver.opts.autoLaunch = false;
    driver.opts.forceAppUnderTest = true;
    expectWdaCaps({bundleId: BUNDLE_ID, shouldLaunchApp: false});
    await startWdaSession.call(driver, BUNDLE_ID);
  });

  it('should ignore forceAppUnderTest if autoLaunch is enabled', async function () {
    driver.opts.forceAppUnderTest = true;
    expectWdaCaps({bundleId: BUNDLE_ID});
    await startWdaSession.call(driver, BUNDLE_ID);
  });
});
