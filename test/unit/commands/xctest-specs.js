import chai from 'chai';
import { parseXCTestStdout } from '../../../lib/commands/xctest';

chai.should();

describe('session commands', function () {
  const xctestLogs1Success = `XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Passed: True | Crashed: False | Duration: 1.485 | Failure message:  | Location :0
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Passed: True | Crashed: False | Duration: 14.297 | Failure message:  | Location :0  
  `.trim();
  const xctestLogs2Success = ` XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Status: passed | Duration: 2.2897069454193115
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Status: passed | Duration: 17.47773802280426
  `.trim();
  const xctestLogs2Failure = `XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Status: passed | Duration: 1.9255789518356323
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Status: failed | Duration: 0.033468008041381836 | Failure message: XCTAssertTrue failed - error message here | Location /path/to/XCTesterAppUITests/XCTesterAppUITests.swift:36
  `.trim();

  describe('xctest', function () {
    it('should parse successful test logs - old version', function () {
      const results = parseXCTestStdout(xctestLogs1Success);
      results.length.should.equal(2);
      results[0].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 1.485,
        failureMessage: null,
        location: ':0',
      });
      results[1].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
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
      results.length.should.equal(2);
      results[0].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 2.2897069454193115,
      });
      results[1].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 17.47773802280426,
      });
    });

    it('should parse unsuccessful test logs', function () {
      const results = parseXCTestStdout(xctestLogs2Failure);
      results.length.should.equal(2);
      results[0].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        status: 'passed',
        crashed: false,
        duration: 1.9255789518356323,
      });
      results[1].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
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
