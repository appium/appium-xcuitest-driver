import type {ConfigurationService} from 'appium-ios-remotexpc';
import {errors} from 'appium/driver.js';

import type {
  ContentSizeAction,
  ContentSizeResult,
  IncreaseContrastAction,
  IncreaseContrastResult,
} from '../commands/types.js';
import {
  CONTENT_SIZE_BY_CORE_DEVICE_SIZE,
  CORE_DEVICE_SIZE_BY_CONTENT_SIZE,
  isContentSizeStep,
  stepContentSize,
} from '../content-size-model.js';
import {supportsApiLevel18, upperFirst} from '../utils/index.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

/** Handed to the facade so its message says what specifically could not be done. */
const NO_FALLBACK_NOTE =
  'Appearance and accessibility settings on a real device are reachable only over RemoteXPC ' +
  'and have no fallback, so nothing was changed or read.';

/**
 * Minimal driver surface needed to build a {@link ConfigurationClient}.
 *
 * Structural rather than importing `XCUITestDriver`, which would create an import cycle.
 */
export interface ConfigurationClientHost {
  readonly device: {udid: string};
  readonly opts: {platformVersion?: string | null};
  readonly remoteXPCFacade: RemoteXPCFacade;
}

/**
 * Appearance and accessibility settings on real hardware, via the CoreDevice
 * `com.apple.coredevice.configuration` service.
 *
 * Requires **iOS/tvOS 18+** and the optional **`appium-ios-remotexpc`** package with a running
 * tunnel. There is deliberately no legacy fallback: these settings are not reachable any other
 * way on a real device, so a missing tunnel fails loudly instead of silently doing nothing.
 */
export class ConfigurationClient {
  constructor(
    private readonly udid: string,
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  /**
   * Reads the Increase Contrast accessibility setting.
   */
  async getIncreaseContrast(): Promise<IncreaseContrastResult> {
    const isEnabled = await this.withConfigurationService((configurationService) =>
      configurationService.getIncreaseContrast(),
    );
    return isEnabled ? 'enabled' : 'disabled';
  }

  /**
   * Toggles the Increase Contrast accessibility setting.
   */
  async setIncreaseContrast(increaseContrast: IncreaseContrastAction): Promise<void> {
    await this.withConfigurationService((configurationService) =>
      configurationService.setIncreaseContrast(increaseContrast === 'enabled'),
    );
  }

  /**
   * Reads the current Dynamic Type size.
   *
   * @returns The size in the driver's canonical kebab-case spelling, or `unknown` if the device
   *          reports nothing or a size this driver does not know about.
   */
  async getContentSize(): Promise<ContentSizeResult> {
    const coreDeviceSize = await this.withConfigurationService((configurationService) =>
      configurationService.getDeviceTextSize(),
    );
    return (coreDeviceSize ? CONTENT_SIZE_BY_CORE_DEVICE_SIZE[coreDeviceSize] : undefined) ?? 'unknown';
  }

  /**
   * Sets the Dynamic Type size.
   *
   * `increment` / `decrement` are emulated by reading the current size and stepping one place
   * through {@link CONTENT_SIZES}; stepping past either end is a no-op.
   *
   * @throws {errors.InvalidArgumentError} If the size is not a known Dynamic Type size.
   */
  async setContentSize(size: ContentSizeAction): Promise<void> {
    if (isContentSizeStep(size)) {
      return await this.stepContentSize(size);
    }
    const coreDeviceSize = CORE_DEVICE_SIZE_BY_CONTENT_SIZE[size];
    if (!coreDeviceSize) {
      throw new errors.InvalidArgumentError(`Unknown content size '${size}'`);
    }
    await this.withConfigurationService((configurationService) =>
      configurationService.setDeviceTextSize(coreDeviceSize),
    );
  }

  private async stepContentSize(direction: 'increment' | 'decrement'): Promise<void> {
    await this.withConfigurationService(async (configurationService) => {
      const coreDeviceSize = await configurationService.getDeviceTextSize();
      const currentSize = (coreDeviceSize ? CONTENT_SIZE_BY_CORE_DEVICE_SIZE[coreDeviceSize] : undefined) ?? '';
      const nextSize = stepContentSize(currentSize, direction);
      if (nextSize === currentSize) {
        return;
      }
      await configurationService.setDeviceTextSize(CORE_DEVICE_SIZE_BY_CONTENT_SIZE[nextSize]);
    });
  }

  private async withConfigurationService<T>(operation: (service: ConfigurationService) => Promise<T>): Promise<T> {
    // Checked up front so this reports the actual cause instead of the facade's generic
    // "not available for this session". There is no fallback for these settings, so the message
    // leads with the command that fixes it.
    if (!(await this.remoteXPCFacade.determineAvailability())) {
      throw new Error(await this.remoteXPCFacade.describeUnavailability(NO_FALLBACK_NOTE));
    }

    const configurationService = await this.remoteXPCFacade.requireService('Configuration', (Services) =>
      Services.startConfigurationService(this.udid),
    );
    try {
      return await operation(configurationService);
    } finally {
      await configurationService.close();
    }
  }
}

/**
 * Builds a {@link ConfigurationClient} for the current real-device session.
 *
 * @throws {errors.NotImplementedError} If the platform version predates iOS/tvOS 18, where the
 *         CoreDevice configuration service does not exist.
 */
export function createConfigurationClient(driver: ConfigurationClientHost, action: string): ConfigurationClient {
  if (!supportsApiLevel18(driver.opts.platformVersion)) {
    throw new errors.NotImplementedError(
      `${upperFirst(action)} on a real device requires iOS/tvOS 18 or newer, ` +
        `but the session platform version is '${driver.opts.platformVersion ?? 'unknown'}'`,
    );
  }
  return new ConfigurationClient(driver.device.udid, driver.remoteXPCFacade);
}
