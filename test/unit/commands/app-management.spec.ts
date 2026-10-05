import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('app management commands', function () {
  const driver = new XCUITestDriver({} as any);
  let mockDriver: sinon.SinonMock;

  beforeEach(function () {
    mockDriver = sinon.mock(driver);
  });

  afterEach(function () {
    mockDriver.verify();
  });

  describe('mobile: launchApp', function () {
    it('should not make the app the application under test by default', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/apps/launch', 'POST', {bundleId: 'com.test.app'});
      await driver.execute('mobile: launchApp', {bundleId: 'com.test.app'});
    });

    it('should make the app the application under test if asAppUnderTest is enabled', async function () {
      mockDriver
        .expects('proxyCommand')
        .once()
        .withExactArgs('/wda/apps/launch', 'POST', {
          bundleId: 'com.test.app',
          arguments: ['-AppleLanguages', '(ja)'],
          environment: {a: 'b'},
          asAppUnderTest: true,
        });
      await driver.execute('mobile: launchApp', {
        bundleId: 'com.test.app',
        arguments: ['-AppleLanguages', '(ja)'],
        environment: {a: 'b'},
        asAppUnderTest: true,
      });
    });

    it('should not pass asAppUnderTest to WDA if it is disabled', async function () {
      mockDriver.expects('proxyCommand').once().withExactArgs('/wda/apps/launch', 'POST', {bundleId: 'com.test.app'});
      await driver.execute('mobile: launchApp', {bundleId: 'com.test.app', asAppUnderTest: false});
    });
  });
});
