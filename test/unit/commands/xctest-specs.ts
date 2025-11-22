import {parseXCTestStdout} from '../../../lib/commands/xctest';
import {expect} from 'chai';


describe('session commands', function () {
  const xctestLogs1Success =
    `XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Passed: True | Crashed: False | Duration: 1.485 | Failure message:  | Location :0
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Passed: True | Crashed: False | Duration: 14.297 | Failure message:  | Location :0
  `.trim();
  const xctestLogs2Success =
    ` XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Status: passed | Duration: 2.2897069454193115
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Status: passed | Duration: 17.47773802280426
  `.trim();
  const xctestLogs2Failure =
    `XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Status: passed | Duration: 1.9255789518356323
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Status: failed | Duration: 0.033468008041381836 | Failure message: XCTAssertTrue failed - error message here | Location /path/to/XCTesterAppUITests/XCTesterAppUITests.swift:36
  `.trim();

  before(async function () {
    const chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    chai.use(chaiAsPromised.default);
  });

  describe('xctest', function () {
    it('should parse successful test logs - old version', function () {
      const results = parseXCTestStdout(xctestLogs1Success);
      expect(results.length).to.equal(2);
      expect(results[0]).to.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 1.485,
        failureMessage: null,
        location: ':0',
      });
      expect(results[1]).to.eql({
        testName:
          'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 14.297,
        failureMessage: null,
        location: ':0',
      });
    });

    it('should parse successful test logs', function () {
      const results = parseXCTestStdout(xctestLogs2Success);
      expect(results.length).to.equal(2);
      expect(results[0]).to.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 2.2897069454193115,
      });
      expect(results[1]).to.eql({
        testName:
          'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 17.47773802280426,
      });
    });

    it('should parse unsuccessful test logs', function () {
      const results = parseXCTestStdout(xctestLogs2Failure);
      expect(results.length).to.equal(2);
      expect(results[0]).to.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 1.9255789518356323,
      });
      expect(results[1]).to.eql({
        testName:
          'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
        passed: false,
        status: 'failed',
        crashed: false,
        duration: 0.033468008041381836,
        location: '/path/to/XCTesterAppUITests/XCTesterAppUITests.swift:36',
        failureMessage: 'XCTAssertTrue failed - error message here',
      });
    });
  });
});
