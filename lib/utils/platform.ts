import {util} from 'appium/support.js';
import * as semver from 'semver';

import {PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS, PLATFORM_NAME_WATCHOS} from '../constants.js';

/** Check if platform name is the TV OS one. */
export function isTvOs(platformName: string | null | undefined): boolean {
  return String(platformName ?? '').toLowerCase() === PLATFORM_NAME_TVOS.toLowerCase();
}

/** Check if platform name is the watchOS one. */
export function isWatchOs(platformName: string | null | undefined): boolean {
  return String(platformName ?? '').toLowerCase() === PLATFORM_NAME_WATCHOS.toLowerCase();
}

/** Return normalized platform name. */
export function normalizePlatformName(platformName: string | null | undefined): string {
  if (isTvOs(platformName)) {
    return PLATFORM_NAME_TVOS;
  }
  if (isWatchOs(platformName)) {
    return PLATFORM_NAME_WATCHOS;
  }
  return PLATFORM_NAME_IOS;
}

/** Normalizes platformVersion to a valid iOS version string. */
export function normalizePlatformVersion(originalVersion: string): string {
  const normalizedVersion = semver.coerce(originalVersion);
  if (!normalizedVersion) {
    throw new Error(`The platform version '${originalVersion}' should be a valid version number`);
  }
  return `${normalizedVersion.major}.${normalizedVersion.minor}`;
}

/** Whether the session's WDA build exposes the API-17-era feature set (e.g. XCTest simulated location). */
export function supportsApiLevel17(platformVersion?: string | null, platformName?: string | null): boolean {
  return supportsApiLevel(17, platformVersion, platformName);
}

/** Like {@link supportsApiLevel17}, gated at API level 18 instead. */
export function supportsApiLevel18(platformVersion?: string | null, platformName?: string | null): boolean {
  return supportsApiLevel(18, platformVersion, platformName);
}

/**
 * Like {@link supportsApiLevel17}, gated at API level 27 instead.
 *
 * No `platformName` param: watchOS 26+ is already numerically aligned with iOS/tvOS (see
 * {@link WATCHOS_EQUIVALENT_VERSION}), so a raw compare against `platformVersion` is correct here
 * regardless of platform.
 */
export function supportsApiLevel27(platformVersion?: string | null): boolean {
  return supportsApiLevel(27, platformVersion);
}

/**
 * Human-readable minimum-version requirement text for an API level gate (e.g.
 * {@link supportsApiLevel17}), phrased for the given `platformName` when known - e.g.
 * `"watchOS 10.0"` or `"tvOS 17.0"` - so error messages don't tell a watchOS user to upgrade to an
 * iOS/tvOS version number that has no watchOS equivalent. Falls back to a platform-agnostic
 * `"API level N"` when `platformName` isn't set.
 */
export function apiLevelRequirementText(apiLevel: number, platformName?: string | null): string {
  if (!platformName) {
    return `API level ${apiLevel}`;
  }
  const version = isWatchOs(platformName) ? watchOsEquivalentVersion(apiLevel) : `${apiLevel}.0`;
  return `${platformName} ${version}`;
}

/**
 * watchOS's own version numbering only aligns with iOS/tvOS's from version 26 onward (Apple's 2025
 * unification to year-based versioning). Before that, watchOS had its own, offset numbering -
 * watchOS 10 shipped alongside iOS/tvOS 17, watchOS 11 alongside iOS/tvOS 18 - so an API-level gate
 * below 26 needs watchOS's own equivalent version, not a raw compare against the iOS/tvOS number.
 * There is no watchOS 12-25: Apple jumped straight from 11 (2024) to 26 (2025), so every API level
 * from 26 up is already numerically aligned and needs no entry here.
 */
const WATCHOS_EQUIVALENT_VERSION: Readonly<Record<number, string>> = {
  17: '10.0',
  18: '11.0',
};

/** The watchOS-native version that corresponds to the given iOS/tvOS API level. */
function watchOsEquivalentVersion(apiLevel: number): string {
  return WATCHOS_EQUIVALENT_VERSION[apiLevel] ?? `${apiLevel}.0`;
}

/**
 * Whether the session's WDA build exposes the feature set introduced at the given iOS/tvOS API
 * level, accounting for watchOS's differently-numbered (and, pre-26, offset) platformVersion.
 */
function supportsApiLevel(apiLevel: number, platformVersion?: string | null, platformName?: string | null): boolean {
  if (!platformVersion) {
    return false;
  }
  const threshold = isWatchOs(platformName) ? watchOsEquivalentVersion(apiLevel) : `${apiLevel}.0`;
  return util.compareVersions(platformVersion, '>=', threshold);
}
