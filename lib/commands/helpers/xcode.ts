import * as xcode from 'appium-xcode';
import type {XcodeVersion} from 'appium-xcode';
import {retry} from 'asyncbox';
import {exec} from 'teen_process';

import {PLATFORM_NAME_IOS, PLATFORM_NAME_TVOS, PLATFORM_NAME_WATCHOS} from '../../constants.js';
import {log} from '../../logger.js';
import {memoize, normalizePlatformName, toErrorMessage} from '../../utils/index.js';

/** Timeout in milliseconds for a single `xcrun` invocation; mirrors the one appium-xcode applies. */
const XCRUN_TIMEOUT_MS = 15000;
/** Attempts allowed for a single `xcrun` SDK version query; mirrors the one appium-xcode applies. */
const XCRUN_SDK_VERSION_ATTEMPTS = 2;
/** `xcrun --sdk` name of the watchOS simulator SDK; appium-xcode has no getter for it. */
const WATCHSIMULATOR_SDK_NAME = 'watchsimulator';

/** Returns installed Xcode version or throws a descriptive error. */
export async function getAndCheckXcodeVersion(): Promise<XcodeVersion> {
  try {
    return await xcode.getVersion(true);
  } catch (err) {
    throw log.errorWithException(`Could not determine Xcode version: ${toErrorMessage(err)}`);
  }
}

/** Returns the maximum available iOS SDK version or throws a descriptive error. */
export async function getAndCheckIosSdkVersion(): Promise<string | null> {
  try {
    return await xcode.getMaxIOSSDK();
  } catch (err) {
    throw log.errorWithException(`Could not determine ${PLATFORM_NAME_IOS} SDK version: ${toErrorMessage(err)}`);
  }
}

/** Returns the maximum available tvOS SDK version or throws a descriptive error. */
export async function getAndCheckTvosSdkVersion(): Promise<string> {
  try {
    return await xcode.getMaxTVOSSDK();
  } catch (err) {
    throw log.errorWithException(`Could not determine ${PLATFORM_NAME_TVOS} SDK version: ${toErrorMessage(err)}`);
  }
}

/**
 * Returns the maximum available watchOS SDK version or throws a descriptive error. A failed lookup
 * is not cached, so sessions started after the watchOS platform gets installed query xcrun again.
 *
 * @throws {Error} If the watchOS simulator SDK version cannot be determined
 */
export async function getAndCheckWatchSdkVersion(): Promise<string> {
  try {
    return await getMaxWatchSdkVersion();
  } catch (err) {
    // the memoized getter caches the promise, so a transient xcrun failure must not be replayed
    // to every later session of a long-lived server
    getMaxWatchSdkVersion.cache.clear();
    throw log.errorWithException(`Could not determine ${PLATFORM_NAME_WATCHOS} SDK version: ${toErrorMessage(err)}`);
  }
}

/**
 * Returns the maximum SDK version supported by the installed Xcode for the given session platform
 * (iOS, tvOS or watchOS), or throws a descriptive error. Unknown platform names fall back to iOS,
 * matching {@link normalizePlatformName}.
 */
export async function getAndCheckMaxSdkVersion(platformName: string | null | undefined): Promise<string | null> {
  switch (normalizePlatformName(platformName)) {
    case PLATFORM_NAME_WATCHOS:
      return await getAndCheckWatchSdkVersion();
    case PLATFORM_NAME_TVOS:
      return await getAndCheckTvosSdkVersion();
    default:
      return await getAndCheckIosSdkVersion();
  }
}

/**
 * Runs `xcrun --sdk <sdk> --show-sdk-version` once and returns the trimmed version string.
 *
 * @throws {Error} If xcrun fails or returns a non-numeric version
 */
async function getMaxSdkVersionFromXcrun(sdk: string): Promise<string> {
  let stdout: string;
  try {
    ({stdout} = await exec('xcrun', ['--sdk', sdk, '--show-sdk-version'], {timeout: XCRUN_TIMEOUT_MS}));
  } catch (err) {
    // the true error can be hidden within the stderr
    const stderr = err instanceof Error && 'stderr' in err ? String(err.stderr) : '';
    const message = toErrorMessage(err);
    throw new Error(stderr ? `${message}: ${stderr}` : message, {cause: err});
  }
  const sdkVersion = String(stdout).trim();
  if (!/\d.\d/.test(sdkVersion)) {
    throw new Error(`xcrun returned a non-numeric ${sdk} SDK version: '${sdkVersion}'`);
  }
  return sdkVersion;
}

/**
 * Retrieves the maximum version of the watchOS simulator SDK supported by the installed Xcode.
 * `appium-xcode` only exposes iOS and tvOS getters, so this shells out to `xcrun` with the same
 * retry and memoization behavior those getters have.
 *
 * @throws {Error} If the SDK version number cannot be determined
 */
export const getMaxWatchSdkVersion = memoize(async function getMaxWatchSdkVersion(): Promise<string> {
  const sdkVersion = await retry(XCRUN_SDK_VERSION_ATTEMPTS, getMaxSdkVersionFromXcrun, WATCHSIMULATOR_SDK_NAME);
  if (sdkVersion == null) {
    throw new Error(`xcrun did not return any ${WATCHSIMULATOR_SDK_NAME} SDK version`);
  }
  return sdkVersion;
});
