import net from 'node:net';
import {describe, it, beforeEach, afterEach} from 'node:test';

import xcode from 'appium-xcode';
import {JWProxy} from 'appium/driver.js';
import {use, expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import esmock from 'esmock';
import {createSandbox, type SinonSandbox, type SinonStubbedMember} from 'sinon';

import {RealDevice} from '../../lib/device/real-device-management.js';
import type {XCUITestDriverOpts} from '../../lib/driver.js';
import {mergeDeep} from '../../lib/utils/index.js';
import {UNIT_LONG_TIMEOUT_MS} from './helpers.js';

use(chaiAsPromised);

const defaultCheckAppPresent = async () => {};
const defaultAssertWdaHostSessionCapsSupported = () => {};
const defaultAssertWdaHostPlatformSupported = () => {};
const defaultGetAndCheckXcodeVersion = async () => ({
  versionString: '20.0',
  versionFloat: 20.0,
  major: 20,
  minor: 0,
  toString() {
    return '20.0';
  },
});
const defaultInstallToRealDevice = async () => {};
const defaultInstallToSimulator = async () => {};
const defaultInstallAUT = async () => {};

let currentCheckAppPresent: (...args: any[]) => any = defaultCheckAppPresent;
let currentAssertWdaHostSessionCapsSupported: (...args: any[]) => any = defaultAssertWdaHostSessionCapsSupported;
let currentAssertWdaHostPlatformSupported: (...args: any[]) => any = defaultAssertWdaHostPlatformSupported;
let currentGetAndCheckXcodeVersion: (...args: any[]) => any = defaultGetAndCheckXcodeVersion;
let currentInstallToRealDevice: (...args: any[]) => any = defaultInstallToRealDevice;
let currentInstallToSimulator: (...args: any[]) => any = defaultInstallToSimulator;
let currentInstallAUT: (...args: any[]) => any = defaultInstallAUT;

const {XCUITestDriver} = await esmock(
  '../../lib/driver.js',
  import.meta.url,
  {},
  {
    '../../lib/commands/helpers/validation.js': {
      checkAppPresent: (...args: any[]) => currentCheckAppPresent(...args),
    },
    '../../lib/commands/helpers/xcode.js': {
      getAndCheckXcodeVersion: (...args: any[]) => currentGetAndCheckXcodeVersion(...args),
    },
    '../../lib/device/wda-host-ops.js': {
      assertWdaHostSessionCapsSupported: (...args: any[]) => currentAssertWdaHostSessionCapsSupported(...args),
      assertWdaHostPlatformSupported: (...args: any[]) => currentAssertWdaHostPlatformSupported(...args),
    },
    '../../lib/device/real-device-management.js': {
      installToRealDevice: (...args: any[]) => currentInstallToRealDevice(...args),
    },
    '../../lib/device/simulator-management.js': {
      installToSimulator: (...args: any[]) => currentInstallToSimulator(...args),
    },
    '../../lib/commands/helpers/app.js': {
      installAUT: (...args: any[]) => currentInstallAUT(...args),
    },
  },
);

const {installAUT: installAUTWithRealDeviceMocks} = await esmock(
  '../../lib/commands/helpers/app.js',
  import.meta.url,
  {},
  {
    '../../lib/device/real-device-management.js': {
      installToRealDevice: (...args: any[]) => currentInstallToRealDevice(...args),
    },
    '../../lib/device/simulator-management.js': {
      installToSimulator: (...args: any[]) => currentInstallToSimulator(...args),
    },
  },
);

async function withPlatformAsync(platform: NodeJS.Platform, fn: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {value: platform});
  try {
    await fn();
  } finally {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  }
}

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
  let sandbox: SinonSandbox;

  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
    currentCheckAppPresent = defaultCheckAppPresent;
    currentAssertWdaHostSessionCapsSupported = defaultAssertWdaHostSessionCapsSupported;
    currentAssertWdaHostPlatformSupported = defaultAssertWdaHostPlatformSupported;
    currentGetAndCheckXcodeVersion = defaultGetAndCheckXcodeVersion;
    currentInstallToRealDevice = defaultInstallToRealDevice;
    currentInstallToSimulator = defaultInstallToSimulator;
    currentInstallAUT = defaultInstallAUT;
  });

  describe('getDefaultUrl', function () {
    let driver: InstanceType<typeof XCUITestDriver>;
    let realDevice: RealDevice;

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
      realDevice = new RealDevice('1234', {} as XCUITestDriverOpts);
      // Mock _wda to avoid getter throwing error
      // For simulators, url.port should be undefined to allow wdaLocalPort to be used
      driver._wda = {
        url: {port: undefined},
      } as any;
    });

    it('real device', function () {
      driver._device = realDevice;
      // For real devices, wda.url.port should be used if available
      driver._wda = {
        url: {port: 8100},
      } as any;
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

  describe('determineDevice host utility gating', function () {
    let driver: InstanceType<typeof XCUITestDriver>;

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
    });

    it('rejects strict non-macOS sessions without udid before SDK lookup', async function () {
      await withPlatformAsync('linux', async () => {
        driver.opts = {
          webDriverAgentUrl: 'http://127.0.0.1:8100',
          deviceName: 'iPhone 15',
        } as any;
        driver.lifecycleData = {} as any;
        const sdkStub = sandbox.stub(xcode, 'getMaxIOSSDK').resolves('18.0');

        await expect(driver.determineDevice()).to.be.rejectedWith(/real-device 'appium:udid'/);
        expect(sdkStub.notCalled).to.be.true;
      });
    });

    it('rejects automatic udid selection in strict non-macOS mode', async function () {
      await withPlatformAsync('linux', async () => {
        driver.opts = {
          usePreinstalledWDA: true,
          udid: 'auto',
          platformVersion: '18.0',
        } as any;
        driver.lifecycleData = {} as any;

        await expect(driver.determineDevice()).to.be.rejectedWith(/Automatic device selection/);
      });
    });

    it('treats explicit udid as a real device in strict non-macOS mode', async function () {
      await withPlatformAsync('linux', async () => {
        driver.opts = {
          usePreinstalledWDA: true,
          udid: 'device-1',
          platformVersion: '18.0',
        } as any;
        driver.lifecycleData = {} as any;

        const result = await driver.determineDevice();

        expect(result.realDevice).to.be.true;
        expect(result.udid).to.eql('device-1');
        expect(result.device).to.be.instanceOf(RealDevice);
      });
    });
  });

  describe('driver commands', function () {
    describe('status', function () {
      let driver: InstanceType<typeof XCUITestDriver>;
      let jwproxyCommandSpy: SinonStubbedMember<typeof JWProxy.prototype.command>;

      beforeEach(function () {
        driver = new XCUITestDriver({} as any);

        // fake the proxy to WDA
        const jwproxy = new JWProxy();
        jwproxyCommandSpy = sandbox.stub(jwproxy, 'command').resolves({some: 'thing'});
        driver._wda = {
          jwproxy,
        } as any;
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
      let driver: InstanceType<typeof XCUITestDriver>;
      let device: any;
      let realDevice: RealDevice;

      afterEach(async function () {
        await driver.deleteSession();
      });
      beforeEach(function () {
        driver = new XCUITestDriver({} as any);
        device = {
          shutdown: () => {},
          isRunning() {
            return true;
          },
          stat() {
            return {state: 'Booted'};
          },
          getWebInspectorSocket() {
            return '/path/to/uds.socket';
          },
          setReduceTransparency: () => {},
          setAutoFillPasswords: () => {},
          reset: () => {},
        };
        const cacheMock = sandbox.mock(driver.appInfosCache);
        cacheMock.expects('extractBundleId').once().returns('bundle.id');
        realDevice = null as any;
        sandbox.stub(driver, 'determineDevice').callsFake(async () => ({device, realDevice, udid: 'stuff'}) as any);
        sandbox.stub(driver, 'configureApp');
        sandbox.stub(driver, 'startLogCapture');
        sandbox.stub(driver, 'startSim');
        sandbox.stub(driver, 'startWda');
        currentInstallAUT = sandbox.stub();
        sandbox.stub(driver, 'connectToRemoteDebugger');
        sandbox.stub(xcode, 'getMaxIOSSDK').resolves('10.0');
        currentCheckAppPresent = sandbox.stub();
        currentAssertWdaHostSessionCapsSupported = sandbox.stub();
        currentAssertWdaHostPlatformSupported = sandbox.stub();
        currentGetAndCheckXcodeVersion = sandbox.stub().resolves({
          versionString: '20.0',
          versionFloat: 20.0,
          major: 20,
          minor: 0,
          toString() {
            return '20.0';
          },
        });
      });

      it('should include server capabilities', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        const resCaps = await driver.createSession(null as any, null as any, structuredClone(caps) as any);
        expect((resCaps[1] as any).javascriptEnabled).to.be.true;
      });

      it('should call startLogCapture', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        const resCaps = await driver.createSession(
          null as any,
          null as any,
          mergeDeep({}, structuredClone(caps), {
            alwaysMatch: {
              'appium:skipLogCapture': false,
            },
          }) as any,
        );
        expect((resCaps[1] as any).javascriptEnabled).to.be.true;
        expect((driver.startLogCapture as any).called).to.be.true;
      });
      it('should not call startLogCapture', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        const resCaps = await driver.createSession(
          null as any,
          null as any,
          mergeDeep({}, structuredClone(caps), {
            alwaysMatch: {
              'appium:skipLogCapture': true,
            },
          }) as any,
        );
        expect((resCaps[1] as any).javascriptEnabled).to.be.true;
        expect((driver.startLogCapture as any).called).to.be.false;
      });
      it('should call setReduceTransparency for a simulator', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        device.simctl = true;
        delete device.devicectl;
        const spy = sandbox.stub(device, 'setReduceTransparency').resolves({device, realDevice});
        await driver.createSession(
          null as any,
          null as any,
          mergeDeep({}, structuredClone(caps), {
            alwaysMatch: {'appium:reduceTransparency': true},
          }) as any,
        );
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.eql(true);
      });

      it('should not call setReduceTransparency for a real device', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        delete device.simctl;
        device.devicectl = true;
        const spy = sandbox.stub(device, 'setReduceTransparency').resolves({device, realDevice});
        await driver.createSession(
          null as any,
          null as any,
          mergeDeep({}, structuredClone(caps), {
            alwaysMatch: {'appium:reduceTransparency': true},
          }) as any,
        );
        expect(spy.notCalled).to.be.true;
      });

      it('should call setAutoFillPasswords for a simulator', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        device.simctl = true;
        delete device.devicectl;
        const spy = sandbox.stub(device, 'setAutoFillPasswords').resolves({device, realDevice});
        await driver.createSession(
          null as any,
          null as any,
          mergeDeep({}, structuredClone(caps), {
            alwaysMatch: {'appium:autoFillPasswords': true},
          }) as any,
        );
        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.eql(true);
      });
      it('should not call setAutoFillPasswords for a real device', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
        delete device.simctl;
        device.devicectl = true;
        const spy = sandbox.stub(device, 'setAutoFillPasswords').resolves({device, realDevice});
        await driver.createSession(
          null as any,
          null as any,
          mergeDeep({}, structuredClone(caps), {
            alwaysMatch: {'appium:setAutoFillPasswords': true},
          }) as any,
        );
        expect(spy.notCalled).to.be.true;
      });

      it('should throw an error if mjpegServerPort is occupied', {timeout: UNIT_LONG_TIMEOUT_MS}, async function () {
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
              null as any,
              null as any,
              mergeDeep({}, structuredClone(caps), {
                alwaysMatch: {'appium:mjpegServerPort': 9100},
              }) as any,
            ),
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
      let driver: InstanceType<typeof XCUITestDriver>;
      const deviceInfoResponse = {some: 'thing'};

      beforeEach(function () {
        driver = new XCUITestDriver({} as any);
        const jwproxy = new JWProxy();
        sandbox.stub(jwproxy, 'command').resolves(deviceInfoResponse);
        driver._wda = {
          jwproxy,
        } as any;
      });

      it('should allow execute methods without whitespace', async function () {
        await expect(driver.execute('mobile:deviceInfo')).to.eventually.eql(deviceInfoResponse);
      });

      it('should allow execute methods with hella whitespace', async function () {
        await expect(driver.execute('mobile:           deviceInfo')).to.eventually.eql(deviceInfoResponse);
      });

      it('should allow execute methods with leading/trailing whitespace', async function () {
        await expect(driver.execute(' mobile: deviceInfo ')).to.eventually.eql(deviceInfoResponse);
      });
    });
  });

  describe('installOtherApps', function () {
    let driver: InstanceType<typeof XCUITestDriver>;

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
    });

    it('should install multiple apps from otherApps as string on on real devices', async function () {
      const installToRealDeviceStub = sandbox.stub();
      currentInstallToRealDevice = installToRealDeviceStub;
      sandbox.stub(driver, 'isRealDevice').returns(true);
      sandbox.stub(driver.helpers, 'configureApp').resolves('/path/to/iosApp.app');
      sandbox.mock(driver.appInfosCache).expects('extractBundleId').resolves('bundle-id');
      (driver.opts as any).device = 'some-device' as any;
      driver.lifecycleData = {createSim: false};
      driver.opts.otherApps = '/path/to/iosApp.app';
      await installAUTWithRealDeviceMocks(driver);
      expect((driver.isRealDevice as any).calledOnce).to.be.true;
      expect((driver.helpers.configureApp as any).calledOnce).to.be.true;
      expect(
        installToRealDeviceStub.calledOnceWithExactly('/path/to/iosApp.app', 'bundle-id', {
          skipUninstall: true,
          timeout: undefined,
        }),
      ).to.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on on real devices', async function () {
      const installToRealDeviceStub = sandbox.stub();
      currentInstallToRealDevice = installToRealDeviceStub;
      sandbox.stub(driver, 'isRealDevice').returns(true);
      const configureAppStub = sandbox.stub(driver.helpers, 'configureApp');
      configureAppStub.onCall(0).resolves('/path/to/iosApp1.app');
      configureAppStub.onCall(1).resolves('/path/to/iosApp2.app');
      sandbox
        .stub(driver.appInfosCache, 'extractBundleId')
        .onCall(0)
        .resolves('bundle-id')
        .onCall(1)
        .resolves('bundle-id2');
      (driver.opts as any).device = 'some-device' as any;
      driver.lifecycleData = {createSim: false};
      driver.opts.otherApps = '["/path/to/iosApp1.app","/path/to/iosApp2.app"]';
      await installAUTWithRealDeviceMocks(driver);
      expect((driver.isRealDevice as any).calledTwice).to.be.true;
      expect((driver.helpers.configureApp as any).calledTwice).to.be.true;
      expect(
        installToRealDeviceStub.calledWith('/path/to/iosApp1.app', 'bundle-id', {
          skipUninstall: true,
          timeout: undefined,
        }),
      ).to.be.true;
      expect(
        installToRealDeviceStub.calledWith('/path/to/iosApp2.app', 'bundle-id2', {
          skipUninstall: true,
          timeout: undefined,
        }),
      ).to.be.true;
    });

    it('should install multiple apps from otherApps as string on simulators', async function () {
      const installToSimulatorStub = sandbox.stub();
      currentInstallToSimulator = installToSimulatorStub;
      sandbox.stub(driver, 'isRealDevice').returns(false);
      sandbox.stub(driver.helpers, 'configureApp').resolves('/path/to/iosApp.app');
      sandbox.mock(driver.appInfosCache).expects('extractBundleId').resolves('bundle-id');
      driver.opts.noReset = false;
      (driver.opts as any).device = 'some-device' as any;
      driver.lifecycleData = {createSim: false};
      driver.opts.otherApps = '/path/to/iosApp.app';
      await installAUTWithRealDeviceMocks(driver);
      expect((driver.isRealDevice as any).calledOnce).to.be.true;
      expect((driver.helpers.configureApp as any).calledOnce).to.be.true;
      expect(
        installToSimulatorStub.calledOnceWithExactly('/path/to/iosApp.app', 'bundle-id', {
          newSimulator: false,
        }),
      ).to.be.true;
    });

    it('should install multiple apps from otherApps as JSON array on simulators', async function () {
      const installToSimulatorStub = sandbox.stub();
      currentInstallToSimulator = installToSimulatorStub;
      sandbox.stub(driver, 'isRealDevice').returns(false);
      const configureAppStub = sandbox.stub(driver.helpers, 'configureApp');
      configureAppStub.onCall(0).resolves('/path/to/iosApp1.app');
      configureAppStub.onCall(1).resolves('/path/to/iosApp2.app');
      sandbox
        .stub(driver.appInfosCache, 'extractBundleId')
        .onCall(0)
        .resolves('bundle-id')
        .onCall(1)
        .resolves('bundle-id2');
      driver.opts.noReset = false;
      driver.lifecycleData = {createSim: false};
      driver.opts.otherApps = '["/path/to/iosApp1.app","/path/to/iosApp2.app"]';
      await installAUTWithRealDeviceMocks(driver);
      expect((driver.isRealDevice as any).calledTwice).to.be.true;
      expect((driver.helpers.configureApp as any).calledTwice).to.be.true;
      expect(
        installToSimulatorStub.calledWith('/path/to/iosApp1.app', 'bundle-id', {
          newSimulator: false,
        }),
      ).to.be.true;
      expect(
        installToSimulatorStub.calledWith('/path/to/iosApp2.app', 'bundle-id2', {
          newSimulator: false,
        }),
      ).to.be.true;
    });
  });
});
