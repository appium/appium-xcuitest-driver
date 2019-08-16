import { WebDriverAgent, BOOTSTRAP_PATH } from '../../lib/wda/webdriveragent';
import * as utils from '../../lib/wda/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import path from 'path';
import _ from 'lodash';
import sinon from 'sinon';

chai.should();
chai.use(chaiAsPromised);

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
  it('should use webDriverAgentUrl override and return current status', async function () {
    let override = 'http://mockurl:8100/';
    let args = Object.assign({}, fakeConstructorArgs);
    args.webDriverAgentUrl = override;
    let agent = new WebDriverAgent({}, args);
    let wdaStub = sinon.stub(agent, 'getStatus');
    wdaStub.callsFake(function () {
      return {build: 'data'};
    });

    await agent.launch('sessionId').should.eventually.eql({build: 'data'});
    agent.url.href.should.eql(override);
    wdaStub.reset();
  });
});

describe('get url', function () {
  it('should use default WDA listening url', function () {
    const args = Object.assign({}, fakeConstructorArgs);
    const agent = new WebDriverAgent({}, args);
    agent.url.href.should.eql('http://localhost:8100/');
  });
  it('should use default WDA listening url with emply base url', function () {
    const wdaLocalPort = '9100';
    const wdaBaseUrl = '';

    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = wdaBaseUrl;
    args.wdaLocalPort = wdaLocalPort;

    const agent = new WebDriverAgent({}, args);
    agent.url.href.should.eql('http://localhost:9100/');
  });
  it('should use customised WDA listening url', function () {
    const wdaLocalPort = '9100';
    const wdaBaseUrl = 'http://mockurl';

    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = wdaBaseUrl;
    args.wdaLocalPort = wdaLocalPort;

    const agent = new WebDriverAgent({}, args);
    agent.url.href.should.eql('http://mockurl:9100/');
  });
  it('should use customised WDA listening url with slash', function () {
    const wdaLocalPort = '9100';
    const wdaBaseUrl = 'http://mockurl/';

    const args = Object.assign({}, fakeConstructorArgs);
    args.wdaBaseUrl = wdaBaseUrl;
    args.wdaLocalPort = wdaLocalPort;

    const agent = new WebDriverAgent({}, args);
    agent.url.href.should.eql('http://mockurl:9100/');
  });
});

describe('setupCaching()', function () {
  let opts = {};
  let wda;
  let wdaStub;
  let wdaStubRemoveApp;
  let wdaDevice;
  const getTimestampStub = sinon.stub(utils, 'getWDAUpgradeTimestamp');

  beforeEach(function () {
    opts = {};
    wdaDevice = { removeApp: () => {} };
    wda = new WebDriverAgent('1', {device: wdaDevice});
    wdaStub = sinon.stub(wda, 'getStatus');
    wdaStubRemoveApp = sinon.stub(wdaDevice, 'removeApp');
  });

  afterEach(function () {
    opts = {};
    for (const stub of [wdaStub, wdaStubRemoveApp, getTimestampStub]) {
      if (stub) {
        stub.reset();
      }
    }
  });

  it('should not call uninstall since no Running WDA', async function () {
    wdaStub.callsFake(function () {
      return null;
    });
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.notCalled.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should not call uninstall since running WDA has only time', async function () {
    wdaStub.callsFake(function () {
      return {build: { time: 'Jun 24 2018 17:08:21' }};
    });
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://localhost:8100/');
  });

  it('should call uninstall once since bundle id is not default without updatedWDABundleId capability', async function () {
    wdaStub.callsFake(function () {
      return {build: { time: 'Jun 24 2018 17:08:21', productBundleIdentifier: 'com.example.WebDriverAgent' }};
    });
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.example.WebDriverAgent').calledOnce.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should call uninstall once since bundle id is different with updatedWDABundleId capability', async function () {
    opts.updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub.callsFake(function () {
      return {build: { time: 'Jun 24 2018 17:08:21', productBundleIdentifier: 'com.example.different.WebDriverAgent' }};
    });

    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.example.different.WebDriverAgent').calledOnce.should.be.true;
    _.isUndefined(wda.webDriverAgentUrl).should.be.true;
  });

  it('should not call uninstall since bundle id is equal to updatedWDABundleId capability', async function () {
    opts.updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub.callsFake(function () {
      return {build: { time: 'Jun 24 2018 17:08:21', productBundleIdentifier: 'com.example.WebDriverAgent' }};
    });

    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.notCalled.should.be.true;
    wda.webDriverAgentUrl.should.equal('http://localhost:8100/');
  });

  it('should call uninstall default bundle id if current revision differs from the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1' }};
    });
    getTimestampStub.callsFake(() => '2');
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.apple.test.WebDriverAgentRunner-Runner').calledOnce.should.be.true;
  });

  it('should call uninstall default bundle id if current revision differs from the bundled one and running productBundleIdentifier is default value', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1', productBundleIdentifier: 'com.facebook.WebDriverAgentRunner' }};
    });
    getTimestampStub.callsFake(() => '2');
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.apple.test.WebDriverAgentRunner-Runner').calledOnce.should.be.true;
  });

  it('should call uninstall running bundle id if current revision differs from the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1', productBundleIdentifier: 'com.example.running.WebDriverAgent' }};
    });
    getTimestampStub.callsFake(() => '2');
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.example.running.WebDriverAgent').calledOnce.should.be.true;
  });

  it('should not call uninstall if current revision is the same as the bundled one', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1' }};
    });
    getTimestampStub.callsFake(() => '1');
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.notCalled.should.be.true;
  });

  it('should not call uninstall if current revision cannot be retrieved from WDA status', async function () {
    wdaStub.callsFake(function () {
      return {build: {}};
    });
    getTimestampStub.callsFake(() => '1');
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.notCalled.should.be.true;
  });

  it('should not call uninstall if current revision cannot be retrieved from the file system', async function () {
    wdaStub.callsFake(function () {
      return {build: { upgradedAt: '1' }};
    });
    getTimestampStub.callsFake(() => null);
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.setupCaching('something');
    wdaStub.calledOnce.should.be.true;
    wdaStubRemoveApp.notCalled.should.be.true;
  });
});

describe('quitAndUninstall()', function () {
  let opts = {};
  let wda;
  let wdaStub;
  let wdaStubRemoveApp;
  let wdaStubQuit;
  let wdaDevice;

  beforeEach(function () {
    opts = {};
    wdaDevice = { removeApp: () => {} };
    wda = new WebDriverAgent('1', {device: wdaDevice});
    wdaStub = sinon.stub(wda, 'getStatus');
    wdaStubQuit = sinon.stub(wda, 'quit');
    wdaStubRemoveApp = sinon.stub(wdaDevice, 'removeApp');
  });

  afterEach(function () {
    opts = {};
    for (const stub of [wdaStub, wdaStubQuit, wdaStubRemoveApp]) {
      if (stub) {
        stub.reset();
      }
    }
  });

  it('should uninstall default app since no Running WDA and no updatedWDABundleId', async function () {
    wdaStub.callsFake(function () {
      return null;
    });
    wdaStubQuit.callsFake(_.noop);
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.quitAndUninstall(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubQuit.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.apple.test.WebDriverAgentRunner-Runner').calledOnce.should.be.true;
  });

  it('should uninstall updatedWDABundleId with no running WDA', async function () {
    opts.updatedWDABundleId = 'com.example.WebDriverAgent';
    wdaStub.callsFake(function () {
      return null;
    });
    wdaStubQuit.callsFake(_.noop);
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.quitAndUninstall(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubQuit.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.example.WebDriverAgent').calledOnce.should.be.true;
  });

  it('should uninstall productBundleIdentifier prior than updatedWDABundleId', async function () {
    opts.updatedWDABundleId = 'com.example.updatedWDABundleId.WebDriverAgent';
    wdaStub.callsFake(function () {
      return {build: { time: 'Jun 24 2018 17:08:21', productBundleIdentifier: 'com.example.productBundleIdentifier.WebDriverAgent' }};
    });
    wdaStubQuit.callsFake(_.noop);
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.quitAndUninstall(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubQuit.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.example.productBundleIdentifier.WebDriverAgent').calledOnce.should.be.true;
  });

  it('should uninstall productBundleIdentifier', async function () {
    wdaStub.callsFake(function () {
      return {build: { time: 'Jun 24 2018 17:08:21', productBundleIdentifier: 'com.example.productBundleIdentifier.WebDriverAgent' }};
    });
    wdaStubQuit.callsFake(_.noop);
    wdaStubRemoveApp.callsFake(_.noop);

    await wda.quitAndUninstall(opts.updatedWDABundleId);
    wdaStub.calledOnce.should.be.true;
    wdaStubQuit.calledOnce.should.be.true;
    wdaStubRemoveApp.withArgs('com.example.productBundleIdentifier.WebDriverAgent').calledOnce.should.be.true;
  });
});
