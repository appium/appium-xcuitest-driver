import _ from 'lodash';
import {fs, util} from 'appium/support';
import * as semver from 'semver';
import path from 'node:path';
import {PLATFORM_NAME_TVOS, PLATFORM_NAME_IOS} from '../desired-caps';
import type {XCUITestDriverOpts, XCUITestDriver} from '../driver';
import type {Simulator} from 'appium-ios-simulator';
import type {RealDevice} from '../device/real-device-management';

const MODULE_NAME = 'appium-xcuitest-driver';
export const UDID_AUTO = 'auto';
export const NATIVE_WIN = 'NATIVE_APP';

/**
 * Stops and removes all web socket handlers that are listening
 * in scope of the current session.
 */
export async function removeAllSessionWebSocketHandlers(this: XCUITestDriver): Promise<void> {
  if (!this.sessionId || !_.isFunction(this.server?.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await this.server.getWebSocketHandlers(this.sessionId);
  for (const pathname of _.keys(activeHandlers)) {
    await this.server.removeWebSocketHandler(pathname);
  }
}

/**
 * Requires that the given driver is running on a Simulator and return
 * the simulator instance.
 */
export function requireSimulator(driver: XCUITestDriver, action: string): Simulator {
  if (!driver.isSimulator()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on Simulator`);
  }
  return driver.device as Simulator;
}

/**
 * Requires that the given driver is running on a real device and return
 * the real device instance.
 */
export function requireRealDevice(driver: XCUITestDriver, action: string): RealDevice {
  if (!driver.isRealDevice()) {
    throw new Error(`${_.upperFirst(action)} can only be performed on a real device`);
  }
  return driver.device as RealDevice;
}

/** Check if platform name is the TV OS one. */
export function isTvOs(platformName: string | null | undefined): boolean {
  return _.toLower(platformName ?? '') === _.toLower(PLATFORM_NAME_TVOS);
}

/** Return normalized platform name. */
export function normalizePlatformName(platformName: string | null | undefined): string {
  return isTvOs(platformName) ? PLATFORM_NAME_TVOS : PLATFORM_NAME_IOS;
}

/** Normalizes platformVersion to a valid iOS version string. */
export function normalizePlatformVersion(originalVersion: string): string {
  const normalizedVersion = semver.coerce(originalVersion);
  if (!normalizedVersion) {
    throw new Error(`The platform version '${originalVersion}' should be a valid version number`);
  }
  return `${normalizedVersion.major}.${normalizedVersion.minor}`;
}

/** Whether the initial Safari URL should be pushed at session start. */
export function shouldSetInitialSafariUrl(opts: XCUITestDriverOpts): boolean {
  return (
    !(opts.safariInitialUrl === '' || (opts.noReset && _.isNil(opts.safariInitialUrl))) &&
    !opts.initialDeeplinkUrl
  );
}

/** Version-gate helper for iOS 17+ capabilities. */
export function isIos17OrNewer(opts: XCUITestDriverOpts): boolean {
  return isIos17OrNewerPlatform(opts.platformVersion);
}

/** Platform-version predicate for iOS 17+. */
export function isIos17OrNewerPlatform(platformVersion?: string | null): boolean {
  return !!platformVersion && util.compareVersions(platformVersion, '>=', '17.0');
}

/** Platform-version predicate for iOS 18+. */
export function isIos18OrNewerPlatform(platformVersion?: string | null): boolean {
  return !!platformVersion && util.compareVersions(platformVersion, '>=', '18.0');
}

/** Version-gate helper for iOS 18+ capabilities. */
export function isIos18OrNewer(opts: XCUITestDriverOpts): boolean {
  return isIos18OrNewerPlatform(opts.platformVersion);
}

/**
 * Reads the content to the current module's package.json
 *
 * @returns The full path to module root
 * @throws If the current module's package.json cannot be determined
 */
const getModuleManifest = _.memoize(async function getModuleManifest(): Promise<
  Record<string, any>
> {
  // Start from the directory containing the compiled output (build/lib) or source (lib)
  // and walk up to find package.json
  let currentDir = path.resolve(__dirname, '..');
  let isAtFsRoot = false;
  while (!isAtFsRoot) {
    const manifestPath = path.join(currentDir, 'package.json');
    try {
      if (await fs.exists(manifestPath)) {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        if (manifest.name === MODULE_NAME) {
          return manifest;
        }
      }
    } catch {}
    const parentDir = path.dirname(currentDir);
    isAtFsRoot = currentDir.length <= parentDir.length;
    currentDir = parentDir;
  }
  throw new Error(`Cannot find the package manifest of the ${MODULE_NAME} Node.js module`);
});

export interface DriverInfo {
  version: string;
  built: string;
}

/** Gets driver build/version metadata from package manifest. */
export const getDriverInfo = _.memoize(async function getDriverInfo(): Promise<DriverInfo> {
  const [stat, manifest] = await Promise.all([
    fs.stat(path.resolve(__dirname, '..')),
    getModuleManifest(),
  ]);
  return {
    built: stat.mtime.toString(),
    version: manifest.version,
  };
});
