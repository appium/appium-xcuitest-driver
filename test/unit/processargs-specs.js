import sinon from 'sinon';
import chai from 'chai';
import XCUITestDriver from '../..';

chai.should();

describe('process args', function () {
  const BUNDLE_ID = 'com.test.app';
  let driver = new XCUITestDriver();
  driver.opts.platformVersion = '10.3';
  let proxySpy = sinon.stub(driver, 'proxyCommand');
  const DEFAULT_CAPS = {
    elementResponseFields: undefined,
    shouldUseCompactResponses: undefined,
    waitForIdleTimeout: undefined,
    shouldWaitForQuiescence: true,
    shouldUseTestManagerForVisibilityDetection: false,
    maxTypingFrequency: 60,
    shouldUseSingletonTestManager: true,
    eventloopIdleDelaySec: 0,
  };

  const PROCESS_ARGS_OBJECT = {
    args: ['a', 'b', 'c'],
    env: { 'a': 'b', 'c': 'd' }
  };

  let processArgsString = JSON.stringify(PROCESS_ARGS_OBJECT);

  let desired = {
    capabilities: {
      firstMatch: [Object.assign({}, DEFAULT_CAPS, {
        bundleId: BUNDLE_ID,
        arguments: PROCESS_ARGS_OBJECT.args,
        environment: PROCESS_ARGS_OBJECT.env,
      })],
      alwaysMatch: {},
    }
  };

  afterEach(function () {
    proxySpy.reset();
  });

  describe('send process args as object', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      let desiredWithProArgsObject = {
        platformName: 'iOS',
        platformVersion: '10.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        bundleId: BUNDLE_ID,
        processArguments: PROCESS_ARGS_OBJECT,
      };
      driver.validateDesiredCaps(desiredWithProArgsObject);
      await driver.startWdaSession(desiredWithProArgsObject.bundleId, desiredWithProArgsObject.processArguments);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/session');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql(desired);
    });
  });

  describe('send process args json string', function () {
    it('should send translated POST /session request with valid desired caps to WDA', async function () {
      let desiredWithProArgsString = {
        platformName: 'iOS',
        platformVersion: '10.3',
        deviceName: 'iPhone 6',
        app: 'testapp.app',
        bundleId: BUNDLE_ID,
        processArguments: processArgsString,
      };
      driver.validateDesiredCaps(desiredWithProArgsString);
      await driver.startWdaSession(desiredWithProArgsString.bundleId, desiredWithProArgsString.processArguments);
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/session');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql(desired);
    });
  });
});
