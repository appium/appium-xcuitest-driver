import type {
  RealDevicePreinstalledHostOps,
  SimulatorHostOps,
  WdaHostOps,
  WdaLaunchEnvironment,
} from 'appium-webdriveragent';
import type {Simulator} from 'appium-ios-simulator';
import type {RealDevice} from './real-device-management';
import type {XCUITestDriver} from '../driver';
import {isIos18OrNewerPlatform} from '../utils';

const XCODE_ONLY_CAPS = [
  'usePrebuiltWDA',
  'useXctestrunFile',
  'prebuildWDA',
  'xcodeOrgId',
  'xcodeSigningId',
  'xcodeConfigFile',
  'keychainPath',
  'keychainPassword',
  'allowProvisioningDeviceRegistration',
  'resultBundlePath',
] as const;

/**
 * Creates WebDriverAgent host operations provided by the XCUITest driver.
 */
export function createWdaHostOps(driver: XCUITestDriver): WdaHostOps {
  return {
    simulator: createSimulatorHostOps(driver),
    realDevicePreinstalled: createRealDevicePreinstalledHostOps(driver),
  };
}

/**
 * Verifies the selected WDA lifecycle can run on the current host platform.
 */
export function assertWdaHostPlatformSupported(driver: XCUITestDriver): void {
  if (process.platform === 'darwin') {
    return;
  }

  if (driver.opts.webDriverAgentUrl) {
    return;
  }

  if (!driver.isRealDevice()) {
    throw new Error(
      `XCUITest simulator sessions require macOS with Xcode. ` +
        `Use a real device with 'appium:usePreinstalledWDA' or provide 'appium:webDriverAgentUrl' ` +
        `to run from '${process.platform}'.`,
    );
  }

  if (!driver.opts.usePreinstalledWDA) {
    throw new Error(
      `The default real-device WebDriverAgent startup strategy requires macOS with Xcode. ` +
        `Use 'appium:usePreinstalledWDA' with a signed prebuilt WebDriverAgent or provide ` +
        `'appium:webDriverAgentUrl' to run from '${process.platform}'.`,
    );
  }

  const xcodeOnlyCaps = XCODE_ONLY_CAPS.filter((capName) => Boolean(driver.opts[capName]));
  if (xcodeOnlyCaps.length > 0) {
    throw new Error(
      `The following capabilities require macOS/Xcode and cannot be used with the ` +
        `RemoteXPC preinstalled WebDriverAgent strategy on '${process.platform}': ` +
        xcodeOnlyCaps.join(', '),
    );
  }

  if (!isIos18OrNewerPlatform(driver.opts.platformVersion)) {
    throw new Error(
      `Running preinstalled WebDriverAgent from '${process.platform}' requires a real device ` +
        `with RemoteXPC tunnel support. The current platformVersion is ` +
        `'${driver.opts.platformVersion ?? 'unknown'}'; use iOS/tvOS 18.0 or newer, or provide ` +
        `'appium:webDriverAgentUrl' for an externally managed WDA.`,
    );
  }

  if (!driver.remoteXPCFacade.eligible) {
    throw new Error(
      `RemoteXPC is required to launch preinstalled WebDriverAgent from '${process.platform}', ` +
        `but this session is not eligible for RemoteXPC.`,
    );
  }
}

function stringifyLaunchEnvironment(env: WdaLaunchEnvironment): Record<string, string> {
  return Object.entries(env).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = String(value);
    return acc;
  }, {});
}

function createSimulatorHostOps(driver: XCUITestDriver): SimulatorHostOps {
  return {
    async launchPreinstalled({udid, bundleId, env}) {
      await (driver.device as Simulator).simctl.exec('launch', {
        args: ['--terminate-running-process', udid, bundleId],
        env,
      });
    },

    async terminate({bundleId}) {
      await (driver.device as Simulator).terminateApp(bundleId);
    },
  };
}

function createRealDevicePreinstalledHostOps(
  driver: XCUITestDriver,
): RealDevicePreinstalledHostOps {
  return {
    async launchPreinstalled({udid, bundleId, env}) {
      try {
        const dvt = await driver.remoteXPCFacade.requireService(
          'launch preinstalled WebDriverAgent',
          (Services) => Services.startDVTService(udid),
        );
        try {
          await dvt.processControl.launch({
            bundleId,
            environment: stringifyLaunchEnvironment(env),
            killExisting: true,
          });
        } finally {
          await dvt.dvtService.close();
        }
      } catch (err) {
        if (process.platform !== 'darwin') {
          throw err;
        }
        driver.log.warn(
          `Failed to launch preinstalled WebDriverAgent via RemoteXPC. ` +
            `Falling back to devicectl. Original error: ${(err as Error).message}`,
        );
        const {devicectl} = driver.device as RealDevice;
        if (!devicectl) {
          throw err;
        }
        await devicectl.launchApp(bundleId, {
          env,
          terminateExisting: true,
        });
      }
    },

    async terminate({udid, bundleId}) {
      try {
        const dvt = await driver.remoteXPCFacade.requireService(
          'terminate preinstalled WebDriverAgent',
          (Services) => Services.startDVTService(udid),
        );
        try {
          const pid = await dvt.processControl.getPidForBundleIdentifier(bundleId);
          if (!pid) {
            driver.log.info(
              `The preinstalled WebDriverAgent process '${bundleId}' was not running`,
            );
            return;
          }
          await dvt.processControl.kill(pid);
        } finally {
          await dvt.dvtService.close();
        }
      } catch (err) {
        if (process.platform !== 'darwin') {
          throw err;
        }
        driver.log.warn(
          `Failed to terminate preinstalled WebDriverAgent via RemoteXPC. ` +
            `Falling back to devicectl. Original error: ${(err as Error).message}`,
        );
        const {devicectl} = driver.device as RealDevice;
        if (!devicectl) {
          throw err;
        }
        await devicectl.terminateApp(bundleId);
      }
    },
  };
}
