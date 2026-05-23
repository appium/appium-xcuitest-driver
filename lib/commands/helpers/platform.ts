import {util} from 'appium/support';
import * as semver from 'semver';
import {PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS} from '../../constants';

export interface PlatformVersionOpts {
  platformVersion?: string | null;
}

/** Check if platform name is the TV OS one. */
export function isTvOs(platformName: string | null | undefined): boolean {
  return String(platformName ?? '').toLowerCase() === PLATFORM_NAME_TVOS.toLowerCase();
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

/** Platform-version predicate for iOS 17+. */
export function isIos17OrNewerPlatform(platformVersion?: string | null): boolean {
  return !!platformVersion && util.compareVersions(platformVersion, '>=', '17.0');
}

/** Platform-version predicate for iOS 18+. */
export function isIos18OrNewerPlatform(platformVersion?: string | null): boolean {
  return !!platformVersion && util.compareVersions(platformVersion, '>=', '18.0');
}

/** Version-gate helper for iOS 17+ capabilities. */
export function isIos17OrNewer(opts: PlatformVersionOpts): boolean {
  return isIos17OrNewerPlatform(opts.platformVersion);
}

/** Version-gate helper for iOS 18+ capabilities. */
export function isIos18OrNewer(opts: PlatformVersionOpts): boolean {
  return isIos18OrNewerPlatform(opts.platformVersion);
}
