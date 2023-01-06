import cmds from '../../lib/commands';
import {createSandbox} from 'sinon';
import {JWProxy} from 'appium/driver';
import XCUITestDriver from '../../lib/driver';
import * as appUtils from '../../lib/app-utils';
import xcode from 'appium-xcode';
import _ from 'lodash';
import chai from 'chai';
import * as utils from '../../lib/utils';
import {MOCHA_LONG_TIMEOUT} from './helpers';

chai.should();
const expect = chai.expect;

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
  /** @type {sinon.SinonSandbox} */
  let sandbox;
  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('getDefaultUrl', function () {
    let driver;

    beforeEach(function () {
      driver = new XCUITestDriver();
    });

    it('real device', function () {
      driver.opts.realDevice = true;
      expect(driver.getDefaultUrl()).eq('http://127.0.0.1:8100/health');
    });

    it('simulator with ipv4', function () {
      driver.opts.realDevice = false;
      driver.opts.address = '127.0.0.1';
      driver.opts.port = '8080';
      expect(driver.getDefaultUrl()).eq('http://127.0.0.1:8080/welcome');
    });

    it('simulator with ipv6', function () {
      driver.opts.realDevice = false;
      driver.opts.address = '::1';
      driver.opts.port = '8080';
      expect(driver.getDefaultUrl()).eq('http://[::1]:8080/welcome');
    });
  });

  describe('driver commands', function () {
    describe('status', function () {
      /** @type {XCUITestDriver} */
      let driver;
      /** @type {sinon.SinonStubStatic<JWProxy, 'command'>} */
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
        };
        realDevice = null;
        // eslint-disable-next-line require-await
        sandbox.stub(driver, 'determineDevice').callsFake(async () => ({device, realDevice}));
        sandbox.stub(driver, 'configureApp');
        sandbox.stub(driver, 'startLogCapture');
        sandbox.stub(driver, 'startSim');
        sandbox.stub(driver, 'startWdaSession');
        sandbox.stub(driver, 'startWda');
        sandbox.stub(driver, 'installAUT');
        sandbox.stub(driver, 'connectToRemoteDebugger');
        sandbox.stub(xcode, 'getMaxIOSSDK').resolves('10.0');
        sandbox.stub(utils, 'checkAppPresent');
        sandbox.stub(appUtils, 'extractBundleId');
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
          })
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
          })
        );
        resCaps[1].javascriptEnabled.should.be.true;
        driver.startLogCapture.called.should.be.false;
      });
      it('should call setReduceTransparency for a simulator', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        realDevice = false;
        const spy = sandbox.stub(device, 'setReduceTransparency').resolves({device, realDevice});
        await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {'appium:reduceTransparency': true},
          })
        );
        spy.calledOnce.should.be.true;
        spy.firstCall.args[0].should.eql(true);
      });

      it('should not call setReduceTransparency for a real device', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        realDevice = true;
        const spy = sandbox.stub(device, 'setReduceTransparency').resolves({device, realDevice});
        await driver.createSession(
          null,
          null,
          _.merge({}, caps, {
            alwaysMatch: {'appium:reduceTransparency': true},
          })
        );
        spy.notCalled.should.be.true;
      });
    });
  });

  describe('installOtherApps', function () {
    let driver = new XCUITestDriver();

    it('should skip install other apps on real devices', async function () {
      sandbox.stub(driver, 'isRealDevice');
      sandbox.stub(driver.helpers, 'parseCapsArray');
      driver.isRealDevice.returns(true);
      await driver.installOtherApps('/path/to/iosApp.app');
      driver.isRealDevice.calledOnce.should.be.true;
      driver.helpers.parseCapsArray.notCalled.should.be.true;
    });

    it('should install multiple apps from otherApps as string on simulators', async function () {
      const SimulatorManagementModule = require('../../lib/simulator-management');
      sandbox.stub(SimulatorManagementModule, 'installToSimulator');
      sandbox.stub(driver, 'isRealDevice');
      driver.isRealDevice.returns(false);
      sandbox.stub(driver.helpers, 'configureApp');
      driver.helpers.configureApp.resolves('/path/to/iosApp.app');
      driver.opts.noReset = false;
      driver.opts.device = 'some-device';
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('/path/to/iosApp.app');
      driver.isRealDevice.calledOnce.should.be.true;
      driver.helpers.configureApp.calledOnce.should.be.true;
      SimulatorManagementModule.installToSimulator.calledOnce.should.be.true;
      SimulatorManagementModule.installToSimulator.calledWith(
        'some-device',
        '/path/to/iosApp.app',
        undefined,
        {newSimulator: false}
      ).should.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on simulators', async function () {
      const SimulatorManagementModule = require('../../lib/simulator-management');
      sandbox.stub(SimulatorManagementModule, 'installToSimulator');
      sandbox.stub(driver, 'isRealDevice');
      driver.isRealDevice.returns(false);
      sandbox.stub(driver.helpers, 'configureApp');
      driver.helpers.configureApp.onCall(0).resolves('/path/to/iosApp1.app');
      driver.helpers.configureApp.onCall(1).resolves('/path/to/iosApp2.app');
      driver.opts.noReset = false;
      driver.opts.device = 'some-device';
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('["/path/to/iosApp1.app","/path/to/iosApp2.app"]');
      driver.isRealDevice.calledOnce.should.be.true;
      driver.helpers.configureApp.calledTwice.should.be.true;
      SimulatorManagementModule.installToSimulator.calledWith(
        'some-device',
        '/path/to/iosApp1.app',
        undefined,
        {newSimulator: false}
      ).should.be.true;
      SimulatorManagementModule.installToSimulator.calledWith(
        'some-device',
        '/path/to/iosApp2.app',
        undefined,
        {newSimulator: false}
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
      ])
    );

    for (const [mixinName, mixin] of Object.entries(cmds)) {
      describe(mixinName, function () {
        /** @type {XCUITestDriver} */
        let driver;

        before(function () {
          driver = new XCUITestDriver();
        });

        for (const propName of Object.getOwnPropertyNames(mixin).filter(
          (propName) => !memoizedMethods.get(mixinName)?.has(propName)
        )) {
          it(`${propName} should be mixed in`, function () {
            try {
              expect(
                foundProps.has(propName),
                `"${propName}" overwrites a member from the driver prototype or another mixin`
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
});
