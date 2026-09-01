import type {Simulator} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import type {RealDevice} from '../../device/real-device-management.js';
import {isWatchOs, upperFirst} from '../../utils/index.js';
import {AutomationSessionBackend} from '../../web-execution/automation-session-backend.js';
import type {WebExecutionBackend} from '../../web-execution/types.js';

export interface DeviceGuardDriver {
  isSimulator(): boolean;
  isRealDevice(): boolean;
  readonly device: unknown;
}

export interface WebContextGuardDriver {
  isWebContext(): boolean;
}

export interface PlatformGuardDriver {
  readonly opts: {platformName?: string | null};
}

export interface AutomationSessionGuardDriver extends WebContextGuardDriver {
  readonly _webExecutionBackend: WebExecutionBackend;
}

/**
 * Requires that the given driver is running on a Simulator and return
 * the simulator instance.
 */
export function requireSimulator(driver: DeviceGuardDriver, action: string): Simulator {
  if (!driver.isSimulator()) {
    throw new Error(`${upperFirst(action)} can only be performed on Simulator`);
  }
  return driver.device as Simulator;
}

/**
 * Requires that the given driver is running on a real device and return
 * the real device instance.
 */
export function requireRealDevice(driver: DeviceGuardDriver, action: string): RealDevice {
  if (!driver.isRealDevice()) {
    throw new Error(`${upperFirst(action)} can only be performed on a real device`);
  }
  return driver.device as RealDevice;
}

/**
 * Throws if the given driver is not currently in a web context.
 */
export function requireWebContext(driver: WebContextGuardDriver, message?: string): void {
  if (!driver.isWebContext()) {
    throw new errors.NotImplementedError(message);
  }
}

/**
 * Requires that the given driver's session was started with `platformName: watchOS`.
 */
export function requireWatchOs(driver: PlatformGuardDriver, action: string): void {
  if (!isWatchOs(driver.opts.platformName)) {
    throw new errors.NotImplementedError(`${upperFirst(action)} can only be performed on watchOS`);
  }
}

/**
 * Requires that the given driver is in a web context currently driven by an active
 * `AutomationSession`, and returns its backend. Used only by commands with no atoms equivalent
 * at all (window sizing, parent frame navigation) - every other web-execution command dispatches
 * through `_webExecutionBackend` unconditionally instead.
 *
 * Checking `isStarted` alone isn't enough: the session is scoped to a single app, and
 * `_webExecutionBackend` already falls back to atoms once `curContext` has moved elsewhere (or
 * to native) - so the resolved backend, not just `isStarted`, is what determines whether the
 * session actually applies here.
 */
export function requireAutomationSessionActive(
  driver: AutomationSessionGuardDriver,
  action: string,
): AutomationSessionBackend {
  const backend = driver.isWebContext() ? driver._webExecutionBackend : undefined;
  if (!(backend instanceof AutomationSessionBackend)) {
    throw new errors.NotImplementedError(
      `${upperFirst(action)} requires an active automation session (see 'mobile: startAutomationSession')`,
    );
  }
  return backend;
}
