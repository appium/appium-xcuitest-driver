import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { GENERIC_CAPS } from '../desired';
import path from 'path';

const APP_UNDER_TEST_PATH = path.join(__dirname, '..', '..', '..', '..', 'test', 'assets', 'XCTesterApp.app');
const TEST_BUNDLE_PATH = path.join(__dirname, '..', '..', '..', '..', 'test', 'assets', 'XCTesterAppUITests-Runner.app');
const XCTEST_BUNDLE_PATH = path.join(TEST_BUNDLE_PATH, 'PlugIns', 'XCTesterAppUITests.xctest');

chai.should();
chai.use(chaiAsPromised);

describe('XCTest', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    driver = await initSession({
      ...GENERIC_CAPS,
      app: APP_UNDER_TEST_PATH,
      launchWithIDB: true,
    });
  });

  afterEach(async function () {
    await deleteSession();
  });
  it('should install an XC test bundle and then run it', async function () {
    // Install the test runner app
    await driver.installApp(TEST_BUNDLE_PATH);

    // Install the xctest bundle
    const res = await driver.execute('mobile: installXCTestBundle', XCTEST_BUNDLE_PATH);
    const bundleTest = 'io.appium.XCTesterAppUITests';
    res.should.eql(bundleTest);

    // Get list of xctest bundles
    const xcTestBundleList = await driver.execute('mobile: listXCTestBundles');
    xcTestBundleList.should.includes(bundleTest);

    // Get list of xctests within bundle
    const xcTestsInBundle = await driver.execute('mobile: listXCTestsInTestBundle', bundleTest);
    xcTestsInBundle.should.eql([
      'XCTesterAppUITests.XCTesterAppUITests/testExample',
      'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
    ]);

    // Now run the tests
    const bundleApp = 'io.appium.XCTesterApp';
    await driver.execute('mobile: runXCTest', {
      testRunnerBundleId: 'io.appium.XCTesterAppUITests.xctrunner',
      appUnderTestBundleId: bundleApp,
      xctestBundleId: bundleTest,
      testType: 'ui',
    });
  });

  // TODO: Test runXCTest fails gracefully
});
