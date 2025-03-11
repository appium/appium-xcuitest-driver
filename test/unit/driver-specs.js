import xcode from 'appium-xcode';
import {JWProxy} from 'appium/driver';
import _ from 'lodash';
import {createSandbox} from 'sinon';
import cmds from '../../lib/commands';
import {XCUITestDriver} from '../../lib/driver';
import * as utils from '../../lib/utils';
import {MOCHA_LONG_TIMEOUT} from './helpers';
import {RealDevice} from '../../lib/real-device';
import net from 'node:net';

const caps = {
  fistMatch: [{}],
  alwaysMatch: {
    platformName: 'iOS',
    'appium:deviceName': 'iPhone 6',
    'appium:app': '/foo.app',
    'appium:platformVersion': '10.0',
  },
};

describe('XCUITestDriver', function () {
  let sandbox;
  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    expect = chai.expect;
  });

  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('getDefaultUrl', function () {
    let driver;
    let realDevice;

    beforeEach(function () {
      driver = new XCUITestDriver();
      realDevice = new RealDevice('1234');
    });

    it('real device', function () {
      driver._device = realDevice;
      expect(driver.getDefaultUrl()).eq('http://127.0.0.1:8100/health');
    });

    it('simulator with ipv4', function () {
      driver.opts.wdaLocalPort = 8111;
      expect(driver.getDefaultUrl()).eq('http://127.0.0.1:8111/health');
    });

    it('simulator with ipv6', function () {
      driver.opts.address = '::1';
      expect(driver.getDefaultUrl()).eq('http://127.0.0.1:8100/health');
    });
  });

  describe('driver commands', function () {
    describe('status', function () {
      /** @type {XCUITestDriver} */
      let driver;
      /** @type {import('sinon').SinonStubbedMember<typeof JWProxy.prototype.command>} */
      let jwproxyCommandSpy;

      beforeEach(function () {
        driver = new XCUITestDriver();

        // fake the proxy to WDA
        const jwproxy = new JWProxy();
        jwproxyCommandSpy = sandbox.stub(jwproxy, 'command').resolves({some: 'thing'});
        driver.wda = {
          jwproxy,
        };
      });

      it('should not have wda status by default', async function () {
        const status = await driver.getStatus();
        jwproxyCommandSpy.calledOnce.should.be.false;
        expect(status.wda).to.be.undefined;
      });

      it('should return wda status if cached', async function () {
        driver.cachedWdaStatus = {};
        const status = await driver.getStatus();
        jwproxyCommandSpy.called.should.be.false;
        status.wda.should.exist;
      });
    });

    describe('createSession', function () {
      let driver;
      let device;
      let realDevice;

      afterEach(async function () {
        await driver.deleteSession();
      });
      beforeEach(function () {
        driver = new XCUITestDriver();
        device = {
          shutdown: _.noop,
          isRunning() {
            return true;
          },
          stat() {
            return {state: 'Booted'};
          },
          getWebInspectorSocket() {
            return '/path/to/uds.socket';
          },
          setReduceTransparency: _.noop,
          setAutoFillPasswords: _.noop,
          reset: _.noop,
        };
        const cacheMock = sandbox.mock(driver.appInfosCache);
        cacheMock.expects('extractBundleId').once().returns('bundle.id');
        realDevice = null;
        sandbox
          .stub(driver, 'determineDevice')
          .callsFake(async () => ({device, realDevice, udid: 'stuff'}));
        sandbox.stub(driver, 'configureApp');
        sandbox.stub(driver, 'startLogCapture');
        sandbox.stub(driver, 'startSim');
        sandbox.stub(driver, 'startWdaSession');
        sandbox.stub(driver, 'startWda');
        sandbox.stub(driver, 'installAUT');
        sandbox.stub(driver, 'connectToRemoteDebugger');
        sandbox.stub(xcode, 'getMaxIOSSDK').resolves('10.0');
        sandbox.stub(utils, 'checkAppPresent');
        sandbox.stub(utils, 'getAndCheckXcodeVersion').resolves({
          versionString: '20.0',
          versionFloat: 20.0,
          major: 20,
          minor: 0,
          toString() {
            return '20.0';
          },
        });
      });

      it('should include server capabilities', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        const resCaps = await driver.createSession(null, null, _.cloneDeep(caps));
        resCaps[1].javascriptEnabled.should.be.true;
      });

      it('should call startLogCapture', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        const resCaps = await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {
              'appium:skipLogCapture': false,
            },
          }),
        );
        resCaps[1].javascriptEnabled.should.be.true;
        driver.startLogCapture.called.should.be.true;
      });
      it('should not call startLogCapture', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        const resCaps = await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {
              'appium:skipLogCapture': true,
            },
          }),
        );
        resCaps[1].javascriptEnabled.should.be.true;
        driver.startLogCapture.called.should.be.false;
      });
      it('should call setReduceTransparency for a simulator', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        device.simctl = true;
        delete device.devicectl;
        const spy = sandbox.stub(device, 'setReduceTransparency').resolves({device, realDevice});
        await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {'appium:reduceTransparency': true},
          }),
        );
        spy.calledOnce.should.be.true;
        spy.firstCall.args[0].should.eql(true);
      });

      it('should not call setReduceTransparency for a real device', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        delete device.simctl;
        device.devicectl = true;
        const spy = sandbox.stub(device, 'setReduceTransparency').resolves({device, realDevice});
        await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {'appium:reduceTransparency': true},
          }),
        );
        spy.notCalled.should.be.true;
      });

      it('should call setAutoFillPasswords for a simulator', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        device.simctl = true;
        delete device.devicectl;
        const spy = sandbox.stub(device, 'setAutoFillPasswords').resolves({device, realDevice});
        await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {'appium:autoFillPasswords': true},
          }),
        );
        spy.calledOnce.should.be.true;
        spy.firstCall.args[0].should.eql(true);
      });
      it('should not call setAutoFillPasswords for a real device', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        delete device.simctl;
        device.devicectl = true;
        const spy = sandbox.stub(device, 'setAutoFillPasswords').resolves({device, realDevice});
        await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {'appium:setAutoFillPasswords': true},
          }),
        );
        spy.notCalled.should.be.true;
      });

      it('should throw an error if mjpegServerPort is occupied', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        delete device.simctl;
        device.devicectl = true;
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.listen(9100, resolve);
          server.on('error', reject);
        });
        try {
          await driver.createSession(
            null,
            null,
            _.merge({}, caps, {
              alwaysMatch: {'appium:mjpegServerPort': 9100},
            }),
          ).should.be.rejectedWith(/mjpegServerPort.*port #9100 is occupied/);
        } finally {
          await new Promise((resolve, reject) => {
            server.close(resolve);
            server.on('error', reject);
        });
       }
      });
    });

    describe('execute', function () {
      /** @type {XCUITestDriver} */
      let driver;
      const deviceInfoResponse = {some: 'thing'};

      beforeEach(function () {
        driver = new XCUITestDriver();
        const jwproxy = new JWProxy();
        sandbox.stub(jwproxy, 'command').resolves(deviceInfoResponse);
        driver.wda = {
          jwproxy,
        };
      });

      it('should allow execute methods without whitespace', async function () {
        await expect(driver.execute('mobile:deviceInfo')).to.eventually.eql(deviceInfoResponse);
      });

      it('should allow execute methods with hella whitespace', async function () {
        await expect(driver.execute('mobile:           deviceInfo')).to.eventually.eql(
          deviceInfoResponse,
        );
      });

      it('should allow execute methods with leading/trailing whitespace', async function () {
        await expect(driver.execute(' mobile: deviceInfo ')).to.eventually.eql(deviceInfoResponse);
      });
    });
  });

  describe('installOtherApps', function () {
    /** @type {XCUITestDriver} */
    let driver;

    beforeEach(function () {
      driver = new XCUITestDriver();
    });

    it('should install multiple apps from otherApps as string on on real devices', async function () {
      const RealDeviceManagementModule = require('../../lib/real-device-management');
      sandbox.stub(RealDeviceManagementModule, 'installToRealDevice');
      sandbox.stub(driver, 'isRealDevice').returns(true);
      sandbox.stub(driver.helpers, 'configureApp').resolves('/path/to/iosApp.app');
      sandbox.mock(driver.appInfosCache)
        .expects('extractBundleId').resolves('bundle-id');
      // @ts-expect-error random stuff on opts
      driver.opts.device = 'some-device';
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('/path/to/iosApp.app');
      (driver.isRealDevice).calledOnce.should.be.true;
      (driver.helpers.configureApp).calledOnce.should.be.true;
      (RealDeviceManagementModule.installToRealDevice).calledOnceWith(
        '/path/to/iosApp.app',
        'bundle-id',
        {skipUninstall: true, timeout: undefined},
      ).should.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on on real devices', async function () {
      const RealDeviceManagementModule = require('../../lib/real-device-management');
      sandbox.stub(RealDeviceManagementModule, 'installToRealDevice');
      sandbox.stub(driver, 'isRealDevice').returns(true);
      const configureAppStub = sandbox.stub(driver.helpers, 'configureApp');
      configureAppStub.onCall(0).resolves('/path/to/iosApp1.app');
      configureAppStub.onCall(1).resolves('/path/to/iosApp2.app');
      sandbox.stub(driver.appInfosCache, 'extractBundleId')
        .onCall(0).resolves('bundle-id')
        .onCall(1).resolves('bundle-id2');
      // @ts-expect-error random stuff on opts
      driver.opts.device = 'some-device';
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('["/path/to/iosApp1.app","/path/to/iosApp2.app"]');
      (driver.isRealDevice).calledTwice.should.be.true;
      (driver.helpers.configureApp).calledTwice.should.be.true;
      (RealDeviceManagementModule.installToRealDevice).calledWith(
        '/path/to/iosApp1.app',
        'bundle-id',
        {skipUninstall: true, timeout: undefined},
      ).should.be.true;
      (RealDeviceManagementModule.installToRealDevice).calledWith(
        '/path/to/iosApp2.app',
        'bundle-id2',
        {skipUninstall: true, timeout: undefined},
      ).should.be.true;
    });

    it('should install multiple apps from otherApps as string on simulators', async function () {
      const SimulatorManagementModule = require('../../lib/simulator-management');
      sandbox.stub(SimulatorManagementModule, 'installToSimulator');
      sandbox.stub(driver, 'isRealDevice').returns(false);
      sandbox.stub(driver.helpers, 'configureApp').resolves('/path/to/iosApp.app');
      sandbox.mock(driver.appInfosCache)
        .expects('extractBundleId').resolves('bundle-id');
      driver.opts.noReset = false;
      // @ts-expect-error random stuff on opts
      driver.opts.device = 'some-device';
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('/path/to/iosApp.app');
      (driver.isRealDevice).calledOnce.should.be.true;
      (driver.helpers.configureApp).calledOnce.should.be.true;
      (SimulatorManagementModule.installToSimulator).calledOnceWith(
        '/path/to/iosApp.app',
        'bundle-id',
        {newSimulator: false},
      ).should.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on simulators', async function () {
      const SimulatorManagementModule = require('../../lib/simulator-management');
      sandbox.stub(SimulatorManagementModule, 'installToSimulator');
      sandbox.stub(driver, 'isRealDevice').returns(false);
      const configureAppStub = sandbox.stub(driver.helpers, 'configureApp');
      configureAppStub.onCall(0).resolves('/path/to/iosApp1.app');
      configureAppStub.onCall(1).resolves('/path/to/iosApp2.app');
      sandbox.stub(driver.appInfosCache, 'extractBundleId')
        .onCall(0).resolves('bundle-id')
        .onCall(1).resolves('bundle-id2');
      driver.opts.noReset = false;
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('["/path/to/iosApp1.app","/path/to/iosApp2.app"]');
      (driver.isRealDevice).calledTwice.should.be.true;
      (driver.helpers.configureApp).calledTwice.should.be.true;
      (SimulatorManagementModule.installToSimulator).calledWith(
        '/path/to/iosApp1.app',
        'bundle-id',
        {newSimulator: false},
      ).should.be.true;
      (SimulatorManagementModule.installToSimulator).calledWith(
        '/path/to/iosApp2.app',
        'bundle-id2',
        {newSimulator: false},
      ).should.be.true;
    });
  });

  describe('mixins', function () {
    /**
     * these methods will fail strict equality checks.
     * key is the prop of the default export from `lib/commands/index.js`,
     * value is a set of method names
     */
    const memoizedMethods = new Map([
      [
        'generalExtensions',
        new Set(['getStatusBarHeight', 'getDevicePixelRatio', 'getScreenInfo']),
      ],
    ]);

    /**
     * Lookup of prop name to method.  Initially, this contains all methods in `XCUITestDriver.prototype`
     * Used to check if:
     * - a mixin method overwrites a method in the driver prototype
     * - a mixin method overwrites a method from another mixin
     * @type {Map<string,string>}
     */
    const foundProps = new Map(
      Object.getOwnPropertyNames(XCUITestDriver.prototype).map((propName) => [
        propName,
        XCUITestDriver.prototype[propName],
      ]),
    );

    for (const [mixinName, mixin] of Object.entries(cmds)) {
      describe(mixinName, function () {
        /** @type {XCUITestDriver} */
        let driver;

        before(function () {
          driver = new XCUITestDriver();
        });

        for (const propName of Object.getOwnPropertyNames(mixin).filter(
          (propName) => !memoizedMethods.get(mixinName)?.has(propName),
        )) {
          it(`${propName} should be mixed in`, function () {
            try {
              expect(
                foundProps.has(propName),
                `"${propName}" overwrites a member from the driver prototype or another mixin`,
              ).to.be.false;
              expect(driver).to.have.property(propName, mixin[propName]);
            } finally {
              foundProps.set(propName, mixinName);
            }
          });
        }
      });
    }
  });
  describe('executeCommand with WDA restart flow', function () {
    let driver;
    let superExecuteCommandStub;
    let isWdaConnectionErrorStub;
    let reconnectWdaStub;
    let reinitializeSessionStub;
    let proxyCommandStub;
    let logStub;

    beforeEach(function () {
      driver = new XCUITestDriver();
      driver.sessionId = 'test-session-id';

      superExecuteCommandStub = sandbox.stub();
      sandbox.stub(XCUITestDriver.prototype, 'executeCommand').callsFake(function (cmd, ...args) {
        return driver.executeCommand.wrappedMethod.call(this, cmd, ...args);
      });

      isWdaConnectionErrorStub = sandbox.stub(driver, 'isWdaConnectionError');
      reconnectWdaStub = sandbox.stub(driver, 'reconnectWda');
      reinitializeSessionStub = sandbox.stub(driver, 'reinitializeSession');
      proxyCommandStub = sandbox.stub(driver, 'proxyCommand');

      logStub = {
        debug: sandbox.stub(),
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
      };

      sandbox.stub(driver, 'log').get(() => logStub);
      Object.defineProperty(Object.getPrototypeOf(XCUITestDriver.prototype), 'executeCommand', {
        value: superExecuteCommandStub,
        writable: true,
      });
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should bypass recovery flow when enableWdaRestart is not set', async function () {
      driver.opts = {enableWdaRestart: false};
      superExecuteCommandStub.resolves('success');

      const result = await driver.executeCommand('test-command', 'arg1');

      expect(result).to.equal('success');
      expect(superExecuteCommandStub.calledOnce).to.be.true;
      expect(superExecuteCommandStub.calledWith('test-command', 'arg1')).to.be.true;
      expect(reconnectWdaStub.called).to.be.false;
      expect(reinitializeSessionStub.called).to.be.false;
    });

    it('should bypass recovery flow for special commands even with enableWdaRestart true', async function () {
      driver.opts = {enableWdaRestart: true};
      driver.getStatus = sandbox.stub().resolves({status: 'ok'});
      await driver.executeCommand('getStatus');
      expect(driver.getStatus.calledOnce).to.be.true;
      expect(superExecuteCommandStub.called).to.be.false;
      driver.getStatus.reset();
      superExecuteCommandStub.resolves({sessionId: 'new-session'});
      await driver.executeCommand('createSession');
      expect(superExecuteCommandStub.calledWith('createSession')).to.be.true;
    });

    it('should attempt recovery when WDA connection error occurs and enableWdaRestart is true', async function () {
      driver.opts = {
        enableWdaRestart: true,
        wdaStartupRetries: 2,
      };

      const connectionError = new Error('socket hang up');
      superExecuteCommandStub.onFirstCall().rejects(connectionError);
      superExecuteCommandStub.onSecondCall().resolves('success after recovery');

      isWdaConnectionErrorStub.withArgs(connectionError).returns(true);
      reconnectWdaStub.resolves({status: 0});
      proxyCommandStub.resolves();

      const result = await driver.executeCommand('findElement', 'accessibility id', 'submit');

      expect(result).to.equal('success after recovery');
      expect(superExecuteCommandStub.callCount).to.equal(2);
      expect(reconnectWdaStub.calledOnce).to.be.true;
      expect(logStub.warn.calledWith(sandbox.match(/WDA issue detected/))).to.be.true;
      expect(logStub.info.calledWith('Recovery successful, retrying original command')).to.be.true;
    });

    it('should reinitialize session when proxyCommand fails with invalid session error', async function () {
      driver.opts = {
        enableWdaRestart: true,
        wdaStartupRetries: 2,
      };

      const connectionError = new Error('socket hang up');
      const sessionError = new Error('invalid session id');

      superExecuteCommandStub.onFirstCall().rejects(connectionError);
      superExecuteCommandStub.onSecondCall().resolves('success after recovery');

      isWdaConnectionErrorStub.withArgs(connectionError).returns(true);
      reconnectWdaStub.resolves({status: 0});
      proxyCommandStub.rejects(sessionError);
      isWdaConnectionErrorStub.withArgs(sessionError).returns(false);
      reinitializeSessionStub.resolves('new-session-id');

      const result = await driver.executeCommand('findElement', 'accessibility id', 'submit');

      expect(result).to.equal('success after recovery');
      expect(superExecuteCommandStub.callCount).to.equal(2);
      expect(reconnectWdaStub.calledOnce).to.be.true;
      expect(reinitializeSessionStub.calledOnce).to.be.true;
      expect(logStub.info.calledWith(sandbox.match(/WDA session is invalid/))).to.be.true;
    });

    it('should skip directly to reinitializeSession when reconnectWda fails', async function () {
      driver.opts = {
        enableWdaRestart: true,
        wdaStartupRetries: 2,
      };

      const connectionError = new Error('socket hang up');
      const reconnectError = new Error('reconnect failed');

      superExecuteCommandStub.onFirstCall().rejects(connectionError);
      superExecuteCommandStub.onSecondCall().resolves('success after recovery');

      isWdaConnectionErrorStub.withArgs(connectionError).returns(true);
      reconnectWdaStub.rejects(reconnectError);
      reinitializeSessionStub.resolves('new-session-id');

      const result = await driver.executeCommand('findElement', 'accessibility id', 'submit');

      expect(result).to.equal('success after recovery');
      expect(superExecuteCommandStub.callCount).to.equal(2);
      expect(reconnectWdaStub.calledOnce).to.be.true;
      expect(reinitializeSessionStub.calledOnce).to.be.true;
      expect(logStub.warn.calledWith(sandbox.match(/Reconnection failed/))).to.be.true;
      expect(logStub.info.calledWith('Attempting full WDA reinitialization...')).to.be.true;
    });

    it('should give up after max attempts and throw the original error', async function () {
      driver.opts = {
        enableWdaRestart: true,
        wdaStartupRetries: 2,
      };

      const connectionError = new Error('socket hang up');

      superExecuteCommandStub.rejects(connectionError);
      isWdaConnectionErrorStub.withArgs(connectionError).returns(true);
      reconnectWdaStub.resolves({status: 0});
      proxyCommandStub.resolves();

      try {
        await driver.executeCommand('findElement', 'accessibility id', 'submit');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.equal(connectionError);
        expect(superExecuteCommandStub.callCount).to.equal(3); // Initial + 2 retries
        expect(reconnectWdaStub.callCount).to.equal(2);
        expect(logStub.warn.calledWith(sandbox.match(/WDA issue detected. Recovery attempt 2\/2/)))
          .to.be.true;
      }
    });

    it('should not attempt recovery for non-connection errors when enableWdaRestart is true', async function () {
      driver.opts = {
        enableWdaRestart: true,
        wdaStartupRetries: 2,
      };

      const nonConnectionError = new Error('element not found');
      superExecuteCommandStub.rejects(nonConnectionError);
      isWdaConnectionErrorStub.withArgs(nonConnectionError).returns(false);

      try {
        await driver.executeCommand('findElement', 'accessibility id', 'submit');
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.equal(nonConnectionError);
        expect(superExecuteCommandStub.calledOnce).to.be.true;
        expect(reconnectWdaStub.called).to.be.false;
        expect(reinitializeSessionStub.called).to.be.false;
      }
    });

    it('should detect session invalid errors and treat them as recoverable', async function () {
      driver.opts = {
        enableWdaRestart: true,
        wdaStartupRetries: 2,
      };

      const sessionError = new Error('Session does not exist');
      superExecuteCommandStub.onFirstCall().rejects(sessionError);
      superExecuteCommandStub.onSecondCall().resolves('success after recovery');

      isWdaConnectionErrorStub.withArgs(sessionError).returns(false);

      reconnectWdaStub.resolves({status: 0});
      proxyCommandStub.rejects(new Error('invalid session id'));
      reinitializeSessionStub.resolves('new-session-id');

      const result = await driver.executeCommand('findElement', 'accessibility id', 'submit');

      expect(result).to.equal('success after recovery');
      expect(superExecuteCommandStub.callCount).to.equal(2);
      expect(reinitializeSessionStub.calledOnce).to.be.true;
    });
  });

  describe('isWdaConnectionError', function () {
    let driver;

    beforeEach(function () {
      driver = new XCUITestDriver();
    });

    it('should return false for null or undefined error', function () {
      expect(driver.isWdaConnectionError(null)).to.be.false;
      expect(driver.isWdaConnectionError(undefined)).to.be.false;
    });

    it('should return true for ECONNREFUSED error', function () {
      const error = new Error('Failed to connect: ECONNREFUSED');
      expect(driver.isWdaConnectionError(error)).to.be.true;
    });

    it('should return true for socket hang up error', function () {
      const error = new Error('socket hang up');
      expect(driver.isWdaConnectionError(error)).to.be.true;
    });

    it('should return false for non-connection errors', function () {
      const error = new Error('element not found');
      expect(driver.isWdaConnectionError(error)).to.be.false;
    });
  });

  describe('XCUITestDriver - reconnectWda', function () {
    let driver;
    let sandbox;
    let clock;
    let logStub;

    beforeEach(function () {
      sandbox = createSandbox();
      clock = sandbox.useFakeTimers();

      driver = new XCUITestDriver();

      driver.wda = {
        isRunning: sandbox.stub(),
      };

      // Stub logging
      logStub = {
        debug: sandbox.stub(),
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
      };
      sandbox.stub(driver, 'log').get(() => logStub);
      sandbox.stub(driver, 'delay').callsFake((ms) => {
        clock.tick(ms);
        return Promise.resolve();
      });
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should successfully reconnect when WDA responds immediately', async function () {
      driver.wda.isRunning.resolves(true);

      const result = await driver.reconnectWda();

      expect(result).to.be.true;
      expect(driver.wda.isRunning.calledOnce).to.be.true;
      expect(logStub.info.calledWith(sandbox.match('WDA is now reachable'))).to.be.true;
    });

    it('should retry until successful within timeout period', async function () {
      driver.wda.isRunning
        .onFirstCall()
        .resolves(false)
        .onSecondCall()
        .resolves(false)
        .onThirdCall()
        .resolves(true);

      const result = await driver.reconnectWda();

      expect(result).to.be.true;
      expect(driver.wda.isRunning.callCount).to.equal(3);
      expect(driver.delay.callCount).to.be.at.least(2);
      expect(logStub.info.calledWith(sandbox.match('WDA is now reachable'))).to.be.true;
    });

    it('should throw error if reconnection fails within timeout period', async function () {
      driver.wda.isRunning.resolves(false);
      const timeoutMs = 1000;

      await expect(driver.reconnectWda(timeoutMs)).to.be.rejectedWith(
        /Failed to reconnect to WDA within.*ms/,
      );
      expect(driver.wda.isRunning.called).to.be.true;
    });
  });

  describe('XCUITestDriver - reinitializeSession', function () {
    let driver;
    let sandbox;
    let wdaStub;
    let logStub;
    let startWdaStub;

    beforeEach(function () {
      sandbox = createSandbox();

      driver = new XCUITestDriver();
      driver.wda = {
        isRunning: sandbox.stub(),
      };

      logStub = {
        debug: sandbox.stub(),
        info: sandbox.stub(),
        warn: sandbox.stub(),
        error: sandbox.stub(),
      };
      sandbox.stub(driver, 'log').get(() => logStub);
      driver._isRecovering = true;
      driver.opts = {bundleId: 'com.example'};

      wdaStub = {
        isRunning: sandbox.stub(),
        quit: sandbox.stub().resolves(),
        fullyStarted: true,
        proxyReqRes: sandbox.stub(),
      };
      driver.wda = wdaStub;

      startWdaStub = sandbox.stub(driver, 'startWda');
      sandbox.stub(driver, 'startWdaSession').resolves();
      sandbox.stub(driver, 'restoreContext').resolves();
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should throw error if starting WDA fails and reset _isRecovering', async function () {
      wdaStub.isRunning.resolves(false);
      startWdaStub.rejects(new Error('Start WDA failed'));

      await expect(driver.reinitializeSession()).to.be.rejectedWith('Start WDA failed');
      expect(driver._isRecovering).to.be.false;
      expect(logStub.error.calledWith(sandbox.match('Failed to reinitialize WDA session'))).to.be
        .true;
      expect(startWdaStub.calledOnce).to.be.true;
    });

    it('should reset _isRecovering even if isRunning throws an error', async function () {
      wdaStub.isRunning.rejects(new Error('WDA check failed'));

      await expect(driver.reinitializeSession()).to.be.rejectedWith('WDA check failed');
      expect(driver._isRecovering).to.be.false;
      expect(logStub.error.calledWith(sandbox.match('Failed to reinitialize WDA session'))).to.be
        .true;
    });
  });
});
