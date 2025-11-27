import xcode from 'appium-xcode';
import {JWProxy} from 'appium/driver';
import _ from 'lodash';
import {createSandbox} from 'sinon';
import * as activeAppInfoCommands from '../../lib/commands/active-app-info';
import * as alertCommands from '../../lib/commands/alert';
import * as appManagementCommands from '../../lib/commands/app-management';
import * as appearanceCommands from '../../lib/commands/appearance';
import * as appStringsCommands from '../../lib/commands/app-strings';
import * as auditCommands from '../../lib/commands/audit';
import * as batteryCommands from '../../lib/commands/battery';
import * as biometricCommands from '../../lib/commands/biometric';
import * as certificateCommands from '../../lib/commands/certificate';
import * as clipboardCommands from '../../lib/commands/clipboard';
import * as conditionCommands from '../../lib/commands/condition';
import * as contentSizeCommands from '../../lib/commands/content-size';
import * as contextCommands from '../../lib/commands/context';
import * as deviceInfoCommands from '../../lib/commands/deviceInfo';
import * as elementCommands from '../../lib/commands/element';
import * as executeCommands from '../../lib/commands/execute';
import * as fileMovementCommands from '../../lib/commands/file-movement';
import * as findCommands from '../../lib/commands/find';
import * as generalCommands from '../../lib/commands/general';
import * as geolocationCommands from '../../lib/commands/geolocation';
import * as gestureCommands from '../../lib/commands/gesture';
import * as iohidCommands from '../../lib/commands/iohid';
import * as keychainsCommands from '../../lib/commands/keychains';
import * as keyboardCommands from '../../lib/commands/keyboard';
import * as localizationCommands from '../../lib/commands/localization';
import * as locationCommands from '../../lib/commands/location';
import * as lockCommands from '../../lib/commands/lock';
import * as logCommands from '../../lib/commands/log';
import * as memoryCommands from '../../lib/commands/memory';
import * as navigationCommands from '../../lib/commands/navigation';
import * as notificationsCommands from '../../lib/commands/notifications';
import * as pasteboardCommands from '../../lib/commands/pasteboard';
import * as pcapCommands from '../../lib/commands/pcap';
import * as performanceCommands from '../../lib/commands/performance';
import * as permissionsCommands from '../../lib/commands/permissions';
import * as proxyHelperCommands from '../../lib/commands/proxy-helper';
import * as recordAudioCommands from '../../lib/commands/record-audio';
import * as recordScreenCommands from '../../lib/commands/recordscreen';
import * as screenshotCommands from '../../lib/commands/screenshots';
import * as sourceCommands from '../../lib/commands/source';
import * as simctlCommands from '../../lib/commands/simctl';
import * as timeoutCommands from '../../lib/commands/timeouts';
import * as webCommands from '../../lib/commands/web';
import * as xctestCommands from '../../lib/commands/xctest';
import * as xctestRecordScreenCommands from '../../lib/commands/xctest-record-screen';
import * as increaseContrastCommands from '../../lib/commands/increase-contrast';
import {XCUITestDriver} from '../../lib/driver';
import * as utils from '../../lib/utils';
import {MOCHA_LONG_TIMEOUT} from './helpers';
import {RealDevice} from '../../lib/device/real-device-management';
import net from 'node:net';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

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
      driver = new XCUITestDriver({} as any);
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
        driver = new XCUITestDriver({} as any);

        // fake the proxy to WDA
        const jwproxy = new JWProxy();
        jwproxyCommandSpy = sandbox.stub(jwproxy, 'command').resolves({some: 'thing'});
        driver.wda = {
          jwproxy,
        };
      });

      it('should not have wda status by default', async function () {
        const status = await driver.getStatus();
        expect(jwproxyCommandSpy.calledOnce).to.be.false;
        expect(status.wda).to.be.undefined;
      });

      it('should return wda status if cached', async function () {
        driver.cachedWdaStatus = {};
        const status = await driver.getStatus();
        expect(jwproxyCommandSpy.called).to.be.false;
        expect(status.wda).to.exist;
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
        driver = new XCUITestDriver({} as any);
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
        expect(resCaps[1].javascriptEnabled).to.be.true;
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
        expect(resCaps[1].javascriptEnabled).to.be.true;
        expect(driver.startLogCapture.called).to.be.true;
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
        expect(resCaps[1].javascriptEnabled).to.be.true;
        expect(driver.startLogCapture.called).to.be.false;
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
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.eql(true);
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
        expect(spy.notCalled).to.be.true;
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
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.eql(true);
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
        expect(spy.notCalled).to.be.true;
      });

      it('should throw an error if mjpegServerPort is occupied', async function () {
        this.timeout(MOCHA_LONG_TIMEOUT);
        delete device.simctl;
        device.devicectl = true;
        const server = net.createServer();
        await new Promise<void>((resolve, reject) => {
          server.listen(9100, () => resolve());
          server.on('error', reject);
        });
        try {
          await expect(
            driver.createSession(
              null,
              null,
              _.merge({}, caps, {
                alwaysMatch: {'appium:mjpegServerPort': 9100},
              }),
            )
          ).to.be.rejectedWith(/mjpegServerPort.*port #9100 is occupied/);
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
        driver = new XCUITestDriver({} as any);
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
      driver = new XCUITestDriver({} as any);
    });

    it('should install multiple apps from otherApps as string on on real devices', async function () {
      const RealDeviceManagementModule = require('../../lib/device/real-device-management');
      sandbox.stub(RealDeviceManagementModule, 'installToRealDevice');
      sandbox.stub(driver, 'isRealDevice').returns(true);
      sandbox.stub(driver.helpers, 'configureApp').resolves('/path/to/iosApp.app');
      sandbox.mock(driver.appInfosCache)
        .expects('extractBundleId').resolves('bundle-id');
      driver.opts.device = 'some-device' as any;
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('/path/to/iosApp.app');
      expect(driver.isRealDevice.calledOnce).to.be.true;
      expect(driver.helpers.configureApp.calledOnce).to.be.true;
      expect(RealDeviceManagementModule.installToRealDevice.calledOnceWithExactly(
        '/path/to/iosApp.app',
        'bundle-id',
        {skipUninstall: true, timeout: undefined},
      )).to.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on on real devices', async function () {
      const RealDeviceManagementModule = require('../../lib/device/real-device-management');
      sandbox.stub(RealDeviceManagementModule, 'installToRealDevice');
      sandbox.stub(driver, 'isRealDevice').returns(true);
      const configureAppStub = sandbox.stub(driver.helpers, 'configureApp');
      configureAppStub.onCall(0).resolves('/path/to/iosApp1.app');
      configureAppStub.onCall(1).resolves('/path/to/iosApp2.app');
      sandbox.stub(driver.appInfosCache, 'extractBundleId')
        .onCall(0).resolves('bundle-id')
        .onCall(1).resolves('bundle-id2');
      driver.opts.device = 'some-device' as any;
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('["/path/to/iosApp1.app","/path/to/iosApp2.app"]');
      expect(driver.isRealDevice.calledTwice).to.be.true;
      expect(driver.helpers.configureApp.calledTwice).to.be.true;
      expect(RealDeviceManagementModule.installToRealDevice.calledWith(
        '/path/to/iosApp1.app',
        'bundle-id',
        {skipUninstall: true, timeout: undefined},
      )).to.be.true;
      expect(RealDeviceManagementModule.installToRealDevice.calledWith(
        '/path/to/iosApp2.app',
        'bundle-id2',
        {skipUninstall: true, timeout: undefined},
      )).to.be.true;
    });

    it('should install multiple apps from otherApps as string on simulators', async function () {
      const SimulatorManagementModule = require('../../lib/device/simulator-management');
      sandbox.stub(SimulatorManagementModule, 'installToSimulator');
      sandbox.stub(driver, 'isRealDevice').returns(false);
      sandbox.stub(driver.helpers, 'configureApp').resolves('/path/to/iosApp.app');
      sandbox.mock(driver.appInfosCache)
        .expects('extractBundleId').resolves('bundle-id');
      driver.opts.noReset = false;
      driver.opts.device = 'some-device' as any;
      driver.lifecycleData = {createSim: false};
      await driver.installOtherApps('/path/to/iosApp.app');
      expect(driver.isRealDevice.calledOnce).to.be.true;
      expect(driver.helpers.configureApp.calledOnce).to.be.true;
      expect(SimulatorManagementModule.installToSimulator.calledOnceWithExactly(
        '/path/to/iosApp.app',
        'bundle-id',
        {newSimulator: false},
      )).to.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on simulators', async function () {
      const SimulatorManagementModule = require('../../lib/device/simulator-management');
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
      expect(driver.isRealDevice.calledTwice).to.be.true;
      expect(driver.helpers.configureApp.calledTwice).to.be.true;
      expect(SimulatorManagementModule.installToSimulator.calledWith(
        '/path/to/iosApp1.app',
        'bundle-id',
        {newSimulator: false},
      )).to.be.true;
      expect(SimulatorManagementModule.installToSimulator.calledWith(
        '/path/to/iosApp2.app',
        'bundle-id2',
        {newSimulator: false},
      )).to.be.true;
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
     * Helper functions that are exported but shouldn't be mixed in as driver methods
     */
    const excludeHelperFunctions = new Set([
      'assertIDB',
      'parseXCTestStdout',
      'parseCommonName',
      'notifyBiDiContextChange',
      'parseContainerPath',
      'gesturesChainToString',
      'assignBiDiLogListener',
    ]);

    /**
     * Exported classes that shouldn't be mixed in as driver methods
     */
    const excludeClasses = new Set([
      'AudioRecorder',
      'ScreenRecorder',
      'TrafficCapture',
      'PerfRecorder',
    ]);

    /**
     * Determines if a property should be included in the mixin tests
     * @param {string} propName - The property name to check
     * @param {string} mixinName - The name of the mixin module
     * @returns {boolean} - True if the property should be tested
     */
    function shouldTestProperty(propName, mixinName) {
      // Exclude memoized methods
      if (memoizedMethods.get(mixinName)?.has(propName)) {
        return false;
      }
      // Exclude module system artifacts
      if (propName === '__esModule') {
        return false;
      }
      // Exclude helper functions that shouldn't be mixed in
      if (excludeHelperFunctions.has(propName)) {
        return false;
      }
      // Exclude exported classes that shouldn't be mixed in
      if (excludeClasses.has(propName)) {
        return false;
      }
      return true;
    }

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

    const cmds = {
      activeAppInfoExtensions: activeAppInfoCommands,
      alertExtensions: alertCommands,
      appManagementExtensions: appManagementCommands,
      appearanceExtensions: appearanceCommands,
      appStringsExtensions: appStringsCommands,
      auditExtensions: auditCommands,
      batteryExtensions: batteryCommands,
      biometricExtensions: biometricCommands,
      certificateExtensions: certificateCommands,
      clipboardExtensions: clipboardCommands,
      conditionExtensions: conditionCommands,
      contentSizeExtensions: contentSizeCommands,
      contextExtensions: contextCommands,
      deviceInfoExtensions: deviceInfoCommands,
      elementExtensions: elementCommands,
      executeExtensions: executeCommands,
      fileMovementExtensions: fileMovementCommands,
      findExtensions: findCommands,
      generalExtensions: generalCommands,
      geolocationExtensions: geolocationCommands,
      gestureExtensions: gestureCommands,
      iohidExtensions: iohidCommands,
      keychainsExtensions: keychainsCommands,
      keyboardExtensions: keyboardCommands,
      localizationExtensions: localizationCommands,
      locationExtensions: locationCommands,
      lockExtensions: lockCommands,
      logExtensions: logCommands,
      memoryExtensions: memoryCommands,
      navigationExtensions: navigationCommands,
      notificationsExtensions: notificationsCommands,
      pasteboardExtensions: pasteboardCommands,
      pcapExtensions: pcapCommands,
      performanceExtensions: performanceCommands,
      permissionsExtensions: permissionsCommands,
      proxyHelperExtensions: proxyHelperCommands,
      recordAudioExtensions: recordAudioCommands,
      recordScreenExtensions: recordScreenCommands,
      screenshotExtensions: screenshotCommands,
      sourceExtensions: sourceCommands,
      simctl: simctlCommands,
      timeoutExtensions: timeoutCommands,
      webExtensions: webCommands,
      xctestExtensions: xctestCommands,
      xctestRecordScreenExtensions: xctestRecordScreenCommands,
      increaseContrastExtensions: increaseContrastCommands,
    };
    for (const [mixinName, mixin] of Object.entries(cmds)) {
      describe(mixinName, function () {
        /** @type {XCUITestDriver} */
        let driver;

        before(function () {
          driver = new XCUITestDriver({} as any);
        });

        for (const propName of Object.getOwnPropertyNames(mixin).filter((propName) =>
          shouldTestProperty(propName, mixinName),
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
});
