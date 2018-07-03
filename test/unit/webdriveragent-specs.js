import { WebDriverAgent, BOOTSTRAP_PATH } from '../../lib/wda/webdriveragent';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import _ from 'lodash';
import sinon from "sinon";

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

  beforeEach(function () {
    wda = new WebDriverAgent("1");
  });

  afterEach(function () {
    wdaStub.reset();
    wdaStubUninstall.reset();
  });

  it('should not call uninstall since no Running WDA', async function () {
    wdaStub = sinon.stub(wda, 'getStatus').callsFake(function () {
      return null;
    });
    wdaStubUninstall = sinon.stub(wda, 'uninstall').callsFake(_.noop);

    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should not call uninstall since running WDA has only time', async function () {
    wdaStub = sinon.stub(wda, 'getStatus').callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21" }};
    });
    wdaStubUninstall = sinon.stub(wda, 'uninstall').callsFake(_.noop);

    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://localhost:8100/');
  });

  it('should call uninstall once since bundle id is not default without updatedWDABundleId capability', async function () {
    wdaStub = sinon.stub(wda, 'getStatus').callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21", productBundleIdentifier: 'com.example.WebDriverAgent' }};
    });
    wdaStubUninstall = sinon.stub(wda, 'uninstall').callsFake(_.noop);

    await wda.setupCaching();
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should call uninstall once since bundle id is different with updatedWDABundleId capability', async function () {
    const updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub = sinon.stub(wda, 'getStatus').callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21", productBundleIdentifier: 'com.example.different.WebDriverAgent' }};
    });

    wdaStubUninstall = sinon.stub(wda, 'uninstall').callsFake(_.noop);

    await wda.setupCaching(updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.calledOnce.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should not call uninstall since bundle id is equal to updatedWDABundleId capability', async function () {
    const updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub = sinon.stub(wda, 'getStatus').callsFake(function () {
      return {build: { time: "Jun 24 2018 17:08:21", productBundleIdentifier: 'com.example.WebDriverAgent' }};
    });

    wdaStubUninstall = sinon.stub(wda, 'uninstall').callsFake(_.noop);

    await wda.setupCaching(updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubUninstall.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://localhost:8100/');
  });
});