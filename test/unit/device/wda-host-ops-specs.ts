import {expect} from 'chai';
import sinon from 'sinon';

import {
  assertWdaHostPlatformSupported,
  assertWdaHostSessionCapsSupported,
  createWdaHostOps,
  isStrictHostUtilityMode,
} from '../../../lib/device/wda-host-ops';

function withPlatform(platform: NodeJS.Platform, fn: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {value: platform});
  try {
    fn();
  } finally {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  }
}

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

describe('wda host ops', function () {
  afterEach(function () {
    sinon.restore();
  });

  describe('assertWdaHostPlatformSupported', function () {
    it('identifies strict non-macOS host utility modes', function () {
      expect(isStrictHostUtilityMode({webDriverAgentUrl: 'http://127.0.0.1:8100'}, 'linux')).to.be.true;
      expect(isStrictHostUtilityMode({usePreinstalledWDA: true}, 'win32')).to.be.true;
      expect(isStrictHostUtilityMode({usePreinstalledWDA: true}, 'darwin')).to.be.false;
    });

    it('rejects non-macOS sessions before device discovery if they need Xcode', function () {
      expect(() => assertWdaHostSessionCapsSupported({}, 'linux')).to.throw(/requires macOS/);
    });

    it('rejects non-macOS strict sessions without explicit udid', function () {
      expect(() =>
        assertWdaHostSessionCapsSupported({usePreinstalledWDA: true, platformVersion: '18.0'}, 'linux'),
      ).to.throw(/explicit real-device 'appium:udid'/);
      expect(() =>
        assertWdaHostSessionCapsSupported({webDriverAgentUrl: 'http://127.0.0.1:8100', udid: 'auto'}, 'linux'),
      ).to.throw(/explicit real-device 'appium:udid'/);
    });

    it('rejects non-macOS preinstalled WDA sessions without platformVersion', function () {
      expect(() => assertWdaHostSessionCapsSupported({usePreinstalledWDA: true, udid: 'device-1'}, 'linux')).to.throw(
        /requires 'appium:platformVersion'/,
      );
    });

    it('allows externally managed WDA on non-macOS hosts', function () {
      withPlatform('linux', () => {
        assertWdaHostPlatformSupported({
          opts: {webDriverAgentUrl: 'http://127.0.0.1:8100', udid: 'device-1'},
        } as any);
      });
    });

    it('rejects simulator sessions on non-macOS hosts', function () {
      withPlatform('linux', () => {
        expect(() =>
          assertWdaHostPlatformSupported({
            opts: {usePreinstalledWDA: true, platformVersion: '18.0', udid: 'device-1'},
            isRealDevice: () => false,
          } as any),
        ).to.throw(/simulator sessions require macOS/);
      });
    });

    it('rejects default real-device WDA startup on non-macOS hosts', function () {
      withPlatform('win32', () => {
        expect(() =>
          assertWdaHostPlatformSupported({
            opts: {platformVersion: '18.0', udid: 'device-1'},
            isRealDevice: () => true,
          } as any),
        ).to.throw(/requires macOS/);
      });
    });

    it('rejects Xcode-only capabilities with non-macOS preinstalled WDA startup', function () {
      withPlatform('linux', () => {
        expect(() =>
          assertWdaHostPlatformSupported({
            opts: {
              platformVersion: '18.0',
              udid: 'device-1',
              usePreinstalledWDA: true,
              usePrebuiltWDA: true,
            },
            isRealDevice: () => true,
          } as any),
        ).to.throw(/usePrebuiltWDA/);
      });
    });

    it('allows RemoteXPC-eligible preinstalled WDA startup on non-macOS hosts', function () {
      withPlatform('linux', () => {
        assertWdaHostPlatformSupported({
          opts: {platformVersion: '18.0', udid: 'device-1', usePreinstalledWDA: true},
          isRealDevice: () => true,
          remoteXPCFacade: {eligible: true},
        } as any);
      });
    });
  });

  describe('createWdaHostOps', function () {
    it('delegates simulator preinstalled launch and terminate to simctl/simulator APIs', async function () {
      const exec = sinon.stub().resolves();
      const terminateApp = sinon.stub().resolves();
      const driver = {
        device: {
          simctl: {exec},
          terminateApp,
        },
      } as any;

      const hostOps = createWdaHostOps(driver);
      await hostOps.simulator?.launchPreinstalled({
        udid: 'sim-1',
        bundleId: 'io.appium.wda.xctrunner',
        env: {USE_PORT: 8100},
        wdaRemotePort: 8100,
        timeoutMs: 60000,
      });
      await hostOps.simulator?.terminate({
        udid: 'sim-1',
        bundleId: 'io.appium.wda.xctrunner',
      });

      expect(exec.calledOnceWith('launch')).to.be.true;
      expect(exec.firstCall.args[1].args).to.eql(['--terminate-running-process', 'sim-1', 'io.appium.wda.xctrunner']);
      expect(terminateApp.calledOnceWith('io.appium.wda.xctrunner')).to.be.true;
    });

    it('delegates real-device preinstalled launch and terminate to RemoteXPC DVT', async function () {
      const launch = sinon.stub().resolves();
      const getPidForBundleIdentifier = sinon.stub().resolves(123);
      const kill = sinon.stub().resolves();
      const close = sinon.stub().resolves();
      const dvt = {
        processControl: {launch, getPidForBundleIdentifier, kill},
        dvtService: {close},
      };
      const startDVTService = sinon.stub().resolves(dvt);
      const requireService = sinon.stub().callsFake(async (_feature, operation) => await operation({startDVTService}));
      const driver = {
        remoteXPCFacade: {requireService},
        log: {info: sinon.stub()},
      } as any;

      const hostOps = createWdaHostOps(driver);
      await hostOps.realDevicePreinstalled?.launchPreinstalled({
        udid: 'device-1',
        bundleId: 'io.appium.wda.xctrunner',
        env: {USE_PORT: 8100},
        wdaRemotePort: 8100,
        timeoutMs: 60000,
      });
      await hostOps.realDevicePreinstalled?.terminate({
        udid: 'device-1',
        bundleId: 'io.appium.wda.xctrunner',
      });

      expect(startDVTService.calledTwice).to.be.true;
      expect(startDVTService.firstCall.args).to.eql(['device-1']);
      expect(startDVTService.secondCall.args).to.eql(['device-1']);
      expect(
        launch.calledOnceWithMatch({
          bundleId: 'io.appium.wda.xctrunner',
          environment: {USE_PORT: '8100'},
          killExisting: true,
        }),
      ).to.be.true;
      expect(getPidForBundleIdentifier.calledOnceWith('io.appium.wda.xctrunner')).to.be.true;
      expect(kill.calledOnceWith(123)).to.be.true;
      expect(close.calledTwice).to.be.true;
    });

    it('falls back to devicectl launch on macOS if RemoteXPC launch fails', async function () {
      await withPlatformAsync('darwin', async () => {
        const launchApp = sinon.stub().resolves();
        const requireService = sinon.stub().rejects(new Error('No tunnel'));
        const driver = {
          remoteXPCFacade: {requireService},
          device: {devicectl: {launchApp}},
          log: {warn: sinon.stub()},
        } as any;

        const hostOps = createWdaHostOps(driver);
        await hostOps.realDevicePreinstalled?.launchPreinstalled({
          udid: 'device-1',
          bundleId: 'io.appium.wda.xctrunner',
          env: {USE_PORT: 8100},
          wdaRemotePort: 8100,
          timeoutMs: 60000,
        });

        expect(launchApp.calledOnceWith('io.appium.wda.xctrunner')).to.be.true;
        expect(launchApp.firstCall.args[1]).to.eql({
          env: {USE_PORT: 8100},
          terminateExisting: true,
        });
      });
    });

    it('falls back to devicectl terminate on macOS if RemoteXPC terminate fails', async function () {
      await withPlatformAsync('darwin', async () => {
        const terminateApp = sinon.stub().resolves();
        const requireService = sinon.stub().rejects(new Error('No tunnel'));
        const driver = {
          remoteXPCFacade: {requireService},
          device: {devicectl: {terminateApp}},
          log: {warn: sinon.stub()},
        } as any;

        const hostOps = createWdaHostOps(driver);
        await hostOps.realDevicePreinstalled?.terminate({
          udid: 'device-1',
          bundleId: 'io.appium.wda.xctrunner',
        });

        expect(terminateApp.calledOnceWith('io.appium.wda.xctrunner')).to.be.true;
      });
    });
  });
});
