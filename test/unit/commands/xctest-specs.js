import chai from 'chai';
import { parseXCTestStdout } from '../../../lib/commands/xctest';

chai.should();

describe('session commands', function () {
  const xctestLogsSuccess = `XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample | Passed: True | Crashed: False | Duration: 1.485 | Failure message:  | Location :0
    XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance | Passed: True | Crashed: False | Duration: 14.297 | Failure message:  | Location :0  
  `.trim();
  describe('xctest', function () {
    it('should parse successful test logs', function () {
      const results = parseXCTestStdout(xctestLogsSuccess);
      results.length.should.equal(2);
      results[0].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample',
        passed: true,
        crashed: false,
        duration: 1.485,
        failureMessage: null,
        location: 0,
      });
      results[1].should.eql({
        testName: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance',
        passed: true,
        crashed: false,
        duration: 14.297,
        failureMessage: null,
        location: 0,
      });
    });
  });
});
