import type {ConfigurationService, DeviceTextSize} from 'appium-ios-remotexpc';
import {errors} from 'appium/driver.js';

import type {
  ContentSizeAction,
  ContentSizeResult,
  IncreaseContrastAction,
  IncreaseContrastResult,
} from '../commands/types.js';
import {supportsApiLevel18, upperFirst} from '../utils/index.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Shape of `ConfigurationService`'s own action dispatcher. It is TypeScript-private in
 * `appium-ios-remotexpc` but a plain method at runtime, so {@link ConfigurationClient.applyContentSize}
 * can reach it for the sizes the package's typed helper refuses to send.
 */
type InvokeCoreDeviceAction = (
  actionIdentifier: string,
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * Spellings `simctl` uses when reporting a size, for the two it does not report in lowercase.
 * Applied to real-device readings so both device types answer `mobile: contentSize` identically.
 * Only the value handed back is affected; everything internal stays canonical kebab-case.
 */
const SIMCTL_SPELLING: Readonly<Record<string, ContentSizeResult>> = {
  'extra-small': 'extra-Small',
  small: 'Small',
};

/** The CoreDevice action identifier behind {@link ConfigurationService.setDeviceTextSize}. */
const SET_DEVICE_TEXT_SIZE_ACTION = 'com.apple.coredevice.action.setdevicetextsize';

/**
 * Dynamic Type sizes in ascending order, mapping the driver's kebab-case command values to the
 * CoreDevice daemon's camelCase names. Order is significant: `increment` / `decrement` step
 * through this list.
 *
 * All twelve sizes the Simulator accepts are present, so real devices and Simulators take and
 * report the same values. The five `accessibility-*` sizes additionally require *Larger
 * Accessibility Sizes* to be enabled on the device (Settings -> Accessibility -> Display & Text
 * Size -> Larger Text); the daemon rejects them with its own message when it is off.
 */
const CORE_DEVICE_SIZE_BY_CONTENT_SIZE = {
  'extra-small': 'extraSmall',
  small: 'small',
  medium: 'medium',
  large: 'large',
  'extra-large': 'extraLarge',
  'extra-extra-large': 'extraExtraLarge',
  'extra-extra-extra-large': 'extraExtraExtraLarge',
  'accessibility-medium': 'accessibilityMedium',
  'accessibility-large': 'accessibilityLarge',
  'accessibility-extra-large': 'accessibilityExtraLarge',
  'accessibility-extra-extra-large': 'accessibilityExtraExtraLarge',
  'accessibility-extra-extra-extra-large': 'accessibilityExtraExtraExtraLarge',
} as const satisfies Partial<Record<ContentSizeAction, string>>;

type KnownContentSize = keyof typeof CORE_DEVICE_SIZE_BY_CONTENT_SIZE;

const CONTENT_SIZE_ORDER = Object.keys(CORE_DEVICE_SIZE_BY_CONTENT_SIZE) as KnownContentSize[];

const CONTENT_SIZE_BY_CORE_DEVICE_SIZE = Object.fromEntries(
  Object.entries(CORE_DEVICE_SIZE_BY_CONTENT_SIZE).map(([contentSize, coreDeviceSize]) => [
    coreDeviceSize,
    contentSize,
  ]),
) as Record<string, KnownContentSize | undefined>;

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
   * @returns The size spelled exactly as a Simulator would report it (see {@link SIMCTL_SPELLING}),
   *          or `unknown` if the device reports nothing or a size this driver does not know about.
   */
  async getContentSize(): Promise<ContentSizeResult> {
    const coreDeviceSize = await this.withConfigurationService((configurationService) =>
      configurationService.getDeviceTextSize(),
    );
    const contentSize = coreDeviceSize ? CONTENT_SIZE_BY_CORE_DEVICE_SIZE[coreDeviceSize] : undefined;
    if (!contentSize) {
      return 'unknown';
    }
    return SIMCTL_SPELLING[contentSize] ?? contentSize;
  }

  /**
   * Sets the Dynamic Type size.
   *
   * `increment` / `decrement` are emulated by reading the current size and stepping one place
   * through {@link CONTENT_SIZE_ORDER}; stepping past either end is a no-op.
   *
   * @throws {errors.InvalidArgumentError} If the size is not a known Dynamic Type size.
   */
  async setContentSize(size: ContentSizeAction): Promise<void> {
    if (size === 'increment' || size === 'decrement') {
      return await this.stepContentSize(size);
    }
    const coreDeviceSize = toCoreDeviceSize(size);
    await this.withConfigurationService((configurationService) =>
      this.applyContentSize(configurationService, coreDeviceSize),
    );
  }

  private async stepContentSize(direction: 'increment' | 'decrement'): Promise<void> {
    await this.withConfigurationService(async (configurationService) => {
      const coreDeviceSize = await configurationService.getDeviceTextSize();
      const currentSize = coreDeviceSize ? CONTENT_SIZE_BY_CORE_DEVICE_SIZE[coreDeviceSize] : undefined;
      if (!currentSize) {
        throw new Error(
          `Cannot ${direction} the content size because the current value ` +
            `(${coreDeviceSize ?? 'none'}) is not one of ${CONTENT_SIZE_ORDER.join(', ')}. ` +
            `Set an explicit size first.`,
        );
      }

      const currentIndex = CONTENT_SIZE_ORDER.indexOf(currentSize);
      const nextIndex = currentIndex + (direction === 'increment' ? 1 : -1);
      if (nextIndex < 0 || nextIndex >= CONTENT_SIZE_ORDER.length) {
        return;
      }
      await this.applyContentSize(
        configurationService,
        CORE_DEVICE_SIZE_BY_CONTENT_SIZE[CONTENT_SIZE_ORDER[nextIndex]],
      );
    });
  }

  /**
   * Writes a Dynamic Type size.
   *
   * `appium-ios-remotexpc` validates against its own seven-name list and throws a `TypeError`
   * before sending, but the daemon understands the five `accessibility*` names too - it answers
   * them with *"Enable Larger Accessibility Sizes on the device before setting"* rather than an
   * unknown-value error. Those are therefore retried through the same action the typed helper
   * invokes, with an identical payload.
   *
   * Preferring the typed helper and falling through only on `TypeError` keeps this self-healing:
   * if the package widens its list, the fallback simply stops being reached.
   */
  private async applyContentSize(configurationService: ConfigurationService, coreDeviceSize: string): Promise<void> {
    try {
      await configurationService.setDeviceTextSize(coreDeviceSize as DeviceTextSize);
      return;
    } catch (err) {
      // A TypeError means the package refused to send - not that the device refused. Anything
      // else is the device talking, and must surface untouched.
      if (!(err instanceof TypeError)) {
        throw err;
      }
    }

    const invokeAction = (configurationService as unknown as {action?: InvokeCoreDeviceAction}).action;
    if (typeof invokeAction !== 'function') {
      throw new Error(
        `The installed appium-ios-remotexpc rejects the '${coreDeviceSize}' content size and ` +
          `exposes no way to send it directly.`,
      );
    }
    await invokeAction.call(configurationService, SET_DEVICE_TEXT_SIZE_ACTION, {
      textSize: {size: {[coreDeviceSize]: {}}},
    });
  }

  private async withConfigurationService<T>(operation: (service: ConfigurationService) => Promise<T>): Promise<T> {
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

function toCoreDeviceSize(size: ContentSizeAction): string {
  const coreDeviceSize = CORE_DEVICE_SIZE_BY_CONTENT_SIZE[size as KnownContentSize];
  if (!coreDeviceSize) {
    throw new errors.InvalidArgumentError(
      `The '${size}' value is expected to be one of ${CONTENT_SIZE_ORDER.join(', ')}, increment, decrement`,
    );
  }
  return coreDeviceSize;
}
