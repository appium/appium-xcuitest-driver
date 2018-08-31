import { WebDriverAgent, BOOTSTRAP_PATH } from '../../lib/wda/webdriveragent';
import * as utils from '../../lib/wda/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import _ from 'lodash';
import sinon from 'sinon';

chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

const fakeConstructorArgs = {
  device: 'some sim',
  platformVersion: '9',
  host: 'me',
  port: '5000',
  realDevice: false
};

const defaultAgentPath = path.resolve(BOOTSTRAP_PATH, 'WebDriverAgent.xcodeproj');
const customBootstrapPath = '/path/to/wda';
const customAgentPath = '/path/to/some/agent/WebDriverAgent.xcodeproj';
const customDerivedDataPath = '/path/to/some/agent/DerivedData/';

describe('Constructor', function () {
  it('should have a default wda agent if not specified', function () {
    let agent = new WebDriverAgent({}, fakeConstructorArgs);
    agent.bootstrapPath.should.eql(BOOTSTRAP_PATH);
    agent.agentPath.should.eql(defaultAgentPath);
  });
  it('should have custom wda bootstrap and default agent if only bootstrap specified', function () {
    let agent = new WebDriverAgent({}, _.defaults({
      bootstrapPath: customBootstrapPath,
    }, fakeConstructorArgs));
    agent.bootstrapPath.should.eql(customBootstrapPath);
    agent.agentPath.should.eql(path.resolve(customBootstrapPath, 'WebDriverAgent.xcodeproj'));
  });
  it('should have custom wda bootstrap and agent if both specified', function () {
    let agent = new WebDriverAgent({}, _.defaults({
      bootstrapPath: customBootstrapPath,
      agentPath: customAgentPath,
    }, fakeConstructorArgs));
    agent.bootstrapPath.should.eql(customBootstrapPath);
    agent.agentPath.should.eql(customAgentPath);
  });
  it('should have custom derivedDataPath if specified', function () {
    let agent = new WebDriverAgent({}, _.defaults({
      derivedDataPath: customDerivedDataPath
    }, fakeConstructorArgs));
    agent.xcodebuild.derivedDataPath.should.eql(customDerivedDataPath);
  });
});

describe('launch', function () {
  it('should use webDriverAgentUrl override', async function () {
    let override = "http://mockurl:8100/";
    let args = Object.assign({}, fakeConstructorArgs);
    args.webDriverAgentUrl = override;
    let agent = new WebDriverAgent({}, args);

    expect(await agent.launch("sessionId")).to.be.undefined;

    agent.url.href.should.eql(override);
  });
});

describe('setupCaching()', function () {
  let wda;
  let wdaStub;
  let wdaStubUninstall;
  const getTimestampStub = sinon.stub(utils, 'getWDAUpgradeTimestamp');

  beforeEach(function () {
    wda = new WebDriverAgent("1");
    wdaStub = sinon.stub(wda, 'getStatus');
    wdaStubUninstall = sinon.stub(wda, 'uninstall');
  });

  afterEach(function () {
    for (const stub of [wdaStub, wdaStubUninstall, getTimestampStub]) {
      if (stub) {
        stub.reset();
      }
    }
  });

  it('should not call uninstall since no Running WDA', async function () {
    wdaStub.callsFake(function () {
      return null;
    });
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should not call uninstall since running WDA has only time', async function () {
    wdaStub.callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21" }};
    });
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://localhost:8100/');
  });

  it('should call uninstall once since bundle id is not default without updatedWDABundleId capability', async function () {
    wdaStub.callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21", productBundleIdentifier: 'com.example.WebDriverAgent' }};
    });
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should call uninstall once since bundle id is different with updatedWDABundleId capability', async function () {
    const updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub.callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21", productBundleIdentifier: 'com.example.different.WebDriverAgent' }};
    });

    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching(updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should not call uninstall since bundle id is equal to updatedWDABundleId capability', async function () {
    const updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub.callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21", productBundleIdentifier: 'com.example.WebDriverAgent' }};
    });

    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching(updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://localhost:8100/');
  });

  it('should call uninstall if current revision differs from the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1' }};
    });
    getTimestampStub.callsFake(() => '2');
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
  });

  it('should not call uninstall if current revision is the same as the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1' }};
    });
    getTimestampStub.callsFake(() => '1');
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
  });

  it('should not call uninstall if current revision cannot be retrieved from WDA status', async function () {
    wdaStub.callsFake(function () {
      return {build: {}};
    });
    getTimestampStub.callsFake(() => '1');
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
  });

  it('should not call uninstall if current revision cannot be retrieved from the file system', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1' }};
    });
    getTimestampStub.callsFake(() => null);
    wdaStubUninstall.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
  });
});