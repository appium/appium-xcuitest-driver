import type {AppiumLogger} from '@appium/types';
import {getSimulator, type Simulator} from 'appium-ios-simulator';

import {getAndCheckIosSdkVersion} from '../commands/helpers';
import {UDID_AUTO} from '../constants';
import type {XCUITestDriverOpts} from '../driver';
import {normalizePlatformVersion} from '../utils';
import {getConnectedDevices, RealDevice} from './real-device-management';
import {isStrictHostUtilityMode} from './wda-host-ops';

export interface DeviceDiscoveryResult {
  device: Simulator | RealDevice;
  realDevice: boolean;
  udid: string;
  createdSimulator: boolean;
  iosSdkVersion: string | null;
  platformVersion?: string;
}

export interface DeviceDiscoveryOptions {
  driverOpts: XCUITestDriverOpts;
  log: AppiumLogger;
  detectUdid: () => Promise<string>;
  getExistingSimulator: (opts: XCUITestDriverOpts) => Promise<Simulator | null | undefined>;
  createSimulator: (opts: XCUITestDriverOpts) => Promise<Simulator>;
}

interface DeviceDiscoveryStrategy {
  isApplicable: (sessionOpts: XCUITestDriverOpts) => boolean;
  determine: () => Promise<DeviceDiscoveryResult>;
}

export class DeviceDiscovery {
  private createdSimulator = false;
  private iosSdkVersion: string | null = null;
  private platformVersion: string | undefined;

  constructor(private readonly config: DeviceDiscoveryOptions) {}

  private get log(): AppiumLogger {
    return this.config.log;
  }

  private get sessionOpts(): XCUITestDriverOpts {
    return this.config.driverOpts;
  }

  private get resolvedSessionOpts(): XCUITestDriverOpts {
    return {
      ...this.sessionOpts,
      platformVersion: this.platformVersion,
    };
  }

  async determine(): Promise<DeviceDiscoveryResult> {
    // in the one case where we create a sim, we will set this state
    this.createdSimulator = false;
    this.iosSdkVersion = null;
    this.platformVersion = this.sessionOpts.platformVersion;
    const isStrictHostMode = isStrictHostUtilityMode(this.sessionOpts);

    return await this.selectStrategy(isStrictHostMode).determine();
  }

  private selectStrategy(isStrictHostMode: boolean): DeviceDiscoveryStrategy {
    const strategies: DeviceDiscoveryStrategy[] = [
      {
        isApplicable: ({udid}) => udid?.toLowerCase() === UDID_AUTO,
        determine: async () => await this.determineDeviceWithAutoUdid(isStrictHostMode),
      },
      {
        isApplicable: ({udid}) => Boolean(udid),
        determine: async () => await this.determineDeviceWithExplicitUdid(isStrictHostMode),
      },
      {
        isApplicable: () => true,
        determine: async () => await this.determineSimulatorDevice(isStrictHostMode),
      },
    ];
    return strategies.find((strategy) => strategy.isApplicable(this.sessionOpts)) as DeviceDiscoveryStrategy;
  }

  private async setupSimulatorPlatformVersion(): Promise<void> {
    const iosSdkVersion = await getAndCheckIosSdkVersion();
    this.iosSdkVersion = iosSdkVersion;
    this.log.info(`iOS SDK Version set to '${iosSdkVersion}'`);
    if (!this.sessionOpts.platformVersion && iosSdkVersion) {
      this.log.info(
        `No platformVersion specified. Using the latest version Xcode supports: '${iosSdkVersion}'. ` +
          `This may cause problems if a simulator does not exist for this platform version.`,
      );
      this.platformVersion = normalizePlatformVersion(iosSdkVersion);
    }
  }

  private async ensurePlatformVersion(device: Simulator | RealDevice): Promise<void> {
    if (this.platformVersion) {
      return;
    }

    this.platformVersion = await device.getPlatformVersion();
    this.log.info(`No platformVersion specified. Using device version: '${this.platformVersion}'`);
  }

  private async createRealDeviceForUdid(udid: string): Promise<DeviceDiscoveryResult> {
    this.log.debug(`Creating iDevice object with udid '${udid}'`);
    const device = new RealDevice(udid, this.sessionOpts, this.log);
    await this.ensurePlatformVersion(device);
    return this.toResult({device, realDevice: true, udid});
  }

  private async determineDeviceWithAutoUdid(isStrictHostMode: boolean): Promise<DeviceDiscoveryResult> {
    if (isStrictHostMode) {
      throw new Error(
        `Automatic device selection requires macOS device discovery utilities. ` +
          `Set an explicit real-device 'appium:udid' when running from '${process.platform}'.`,
      );
    }

    try {
      const udid = await this.config.detectUdid();
      return await this.createRealDeviceForUdid(udid);
    } catch (err) {
      this.log.warn(
        `Cannot detect any connected real devices. Falling back to Simulator. Original error: ${
          (err as Error).message
        }`,
      );
      await this.setupSimulatorPlatformVersion();

      const device = await this.config.getExistingSimulator(this.resolvedSessionOpts);
      if (!device) {
        throw this.log.errorWithException(
          `Cannot detect udid for ${this.sessionOpts.deviceName} Simulator running iOS ${this.platformVersion}`,
        );
      }
      await this.ensurePlatformVersion(device);
      return this.toResult({device, realDevice: false, udid: device.udid});
    }
  }

  private async determineDeviceWithExplicitUdid(isStrictHostMode: boolean): Promise<DeviceDiscoveryResult> {
    const udid = this.sessionOpts.udid as string;
    let isRealDeviceUdid = false;
    // If webDriverAgentUrl is set with a real device, assume the user prepared the device.
    const shouldCheckAvailableRealDevices = !this.sessionOpts.webDriverAgentUrl;
    if (shouldCheckAvailableRealDevices) {
      if (isStrictHostMode) {
        isRealDeviceUdid = true;
      } else {
        const devices = await getConnectedDevices(this.sessionOpts);
        this.log.debug(`Available real devices: ${devices.join(', ')}`);
        isRealDeviceUdid = devices.includes(udid);
      }
    }

    if (!isRealDeviceUdid) {
      const simulatorDevice = await this.determineSimulatorWithExplicitUdid(
        udid,
        shouldCheckAvailableRealDevices,
        isStrictHostMode,
      );
      if (simulatorDevice) {
        return simulatorDevice;
      }
    }

    return await this.createRealDeviceForUdid(udid);
  }

  private async determineSimulatorWithExplicitUdid(
    udid: string,
    shouldCheckAvailableRealDevices: boolean,
    isStrictHostMode: boolean,
  ): Promise<DeviceDiscoveryResult | null> {
    if (isStrictHostMode) {
      this.log.debug(
        `Skipping Simulator lookup for '${udid}' because the selected session ` +
          `strategy must not use macOS Simulator utilities`,
      );
      return null;
    }

    try {
      const device = await getSimulator(udid, {
        devicesSetPath: this.sessionOpts.simulatorDevicesSetPath,
        logger: this.log,
      });
      await this.ensurePlatformVersion(device);
      return this.toResult({device, realDevice: false, udid});
    } catch {
      if (shouldCheckAvailableRealDevices) {
        throw new Error(`Unknown device or simulator UDID: '${udid}'`);
      }
      this.log.debug(
        'Skipping checking of the real devices availability since the session specifies appium:webDriverAgentUrl',
      );
      return null;
    }
  }

  private async determineSimulatorDevice(isStrictHostMode: boolean): Promise<DeviceDiscoveryResult> {
    this.log.info(
      `No real device udid has been provided in capabilities. ` + `Will select a matching simulator to run the test.`,
    );
    if (isStrictHostMode) {
      throw new Error(
        `A real-device 'appium:udid' is required when running from '${process.platform}' without ` +
          `macOS Simulator utilities.`,
      );
    }

    await this.setupSimulatorPlatformVersion();
    if (this.sessionOpts.enforceFreshSimulatorCreation) {
      this.log.debug(
        `New simulator is requested. If this is not wanted, set 'enforceFreshSimulatorCreation' capability to false`,
      );
    } else {
      const device = await this.config.getExistingSimulator(this.resolvedSessionOpts);
      if (device) {
        await this.ensurePlatformVersion(device);
        return this.toResult({device, realDevice: false, udid: device.udid});
      }
    }

    this.log.info('Using desired caps to create a new simulator');
    this.createdSimulator = true;
    const device = await this.config.createSimulator(this.resolvedSessionOpts);
    await this.ensurePlatformVersion(device);
    return this.toResult({device, realDevice: false, udid: device.udid});
  }

  private toResult(result: Pick<DeviceDiscoveryResult, 'device' | 'realDevice' | 'udid'>): DeviceDiscoveryResult {
    return {
      ...result,
      createdSimulator: this.createdSimulator,
      iosSdkVersion: this.iosSdkVersion,
      platformVersion: this.platformVersion,
    };
  }
}
