import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { GENERIC_CAPS } from '../desired';

const APP_UNDER_TEST_PATH = 'https://github.com/dpgraham/xctesterapp/releases/download/0.1/XCTesterApp.app.zip';
const TEST_BUNDLE_PATH = 'https://github.com/dpgraham/xctesterapp/releases/download/0.1/XCTesterAppUITests-Runner.app.zip';
const XCTEST_BUNDLE_PATH = 'https://github.com/dpgraham/xctesterapp/releases/download/0.1/XCTesterAppUITests.xctest.zip';

chai.should();
chai.use(chaiAsPromised);

if (process.env.LAUNCH_WITH_IDB) {
  describe('XCTest', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver;

    beforeEach(async function () {
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
      await driver.execute('mobile: installXCTestBundle', {xctestApp: XCTEST_BUNDLE_PATH});

      // Get list of xctest bundles
      const xcTestBundleList = await driver.execute('mobile: listXCTestBundles');
      const bundleTest = 'io.appium.XCTesterAppUITests';
      xcTestBundleList.should.includes(bundleTest);

      // Get list of xctests within bundle
      const xcTestsInBundle = await driver.execute('mobile: listXCTestsInTestBundle', {bundle: bundleTest});
      xcTestsInBundle.should.eql([
        'XCTesterAppUITests.XCTesterAppUITests/testExample',
        'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
      ]);

      // Now run the tests
      const bundleApp = 'io.appium.XCTesterApp';
      const res = await driver.execute('mobile: runXCTest', {
        testRunnerBundleId: 'io.appium.XCTesterAppUITests.xctrunner',
        appUnderTestBundleId: bundleApp,
        xctestBundleId: bundleTest,
        testType: 'ui',
      });
      res.code.should.equal(0);
      res.passed.should.be.true;
      res.results[0].testName.should.eql('XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample');
      res.results[0].passed.should.be.true;
      res.results[1].testName.should.eql('XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance');
      res.results[1].passed.should.be.true;
    });
    it('should fail gracefully if bad params passed in runXCTest', async function () {
      try {
        await driver.execute('mobile: runXCTest', {
          testRunnerBundleId: 'bad',
          appUnderTestBundleId: 'bad',
          xctestBundleId: 'bad',
          testType: 'ui',
        });
      } catch (e) {
        e.message.should.match(/Couldn't find test with id: bad/);
        e.status.should.eql(13);
        return;
      }

      throw new Error(`An exception should have been thrown`);
    });
    it('should fail if timeout', async function () {
      try {
        await driver.execute('mobile: runXCTest', {
          testRunnerBundleId: 'bad',
          appUnderTestBundleId: 'bad',
          xctestBundleId: 'bad',
          testType: 'ui',
          timeout: 1,
        });
      } catch (e) {
        e.message.should.match(/Timed out after '1ms' waiting for XCTest to complete/);
        e.status.should.eql(13);
        return;
      }

      throw new Error(`An exception should have been thrown`);
    });
  });
}