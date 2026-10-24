import assert from 'node:assert';
import {spawn} from 'node:child_process';
import {cp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';

import type {
  CachedAppInfo,
  ConfigureAppOptions,
  DownloadAppOptions,
  DriverOpts,
  HTTPHeaders,
  PostProcessOptions,
  PostProcessResult,
  StringRecord,
} from '@appium/types';
import type {Simulator} from 'appium-ios-simulator';
import {fs, tempDir, timing, util, zip} from 'appium/support.js';
import {exec} from 'teen_process';

import type {XCUITestDriverConstraints} from '../../desired-caps.js';
import {installToRealDevice, type RealDevice} from '../../device/real-device-management.js';
import {installToSimulator} from '../../device/simulator-management.js';
import type {XCUITestDriver} from '../../driver.js';
import {log} from '../../logger.js';
import type {WatchAppBundleCandidate, WatchAppInfo, WatchAppSessionOpts} from '../../types.js';
import {isEmpty, isPlainObject, isTvOs, isWatchOs} from '../../utils/index.js';
import {APP_EXT, IPA_EXT, SUPPORTED_EXTENSIONS} from '../constants.js';
import type {AutInstallationState, AutInstallationStateOptions} from '../types.js';

const ZIP_EXT = '.zip';
const SANITIZE_REPLACEMENT = '-';
const INTEL_ARCH = 'x86_64';
const MAX_ARCHIVE_SCAN_DEPTH = 1;

type SafariPreferencesOpts = Pick<DriverOpts<XCUITestDriverConstraints>, 'safariGlobalPreferences'>;

export const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const SAFARI_OPTS_ALIASES_MAP = {
  safariAllowPopups: [
    ['WebKitJavaScriptCanOpenWindowsAutomatically', 'JavaScriptCanOpenWindowsAutomatically'],
    (x: boolean) => Number(Boolean(x)),
  ],
  safariIgnoreFraudWarning: [['WarnAboutFraudulentWebsites'], (x: boolean) => Number(!x)],
  safariOpenLinksInBackground: [['OpenLinksInBackground'], (x: boolean) => Number(Boolean(x))],
} as const;
const MACOS_RESOURCE_FOLDER = '__MACOSX';

export interface UnzipInfo {
  rootDir: string;
  archiveSize: number;
}

/**
 * Unzips a ZIP archive on the local file system.
 *
 * @param archivePath Full path to a .zip archive
 * @returns Temporary folder root where the archive has been extracted
 */
export async function unzipFile(archivePath: string): Promise<UnzipInfo> {
  const useSystemUnzipEnv = process.env.APPIUM_PREFER_SYSTEM_UNZIP;
  const useSystemUnzip =
    isEmpty(useSystemUnzipEnv) || !['0', 'false'].includes(String(useSystemUnzipEnv).toLowerCase());
  const tmpRoot = await tempDir.openDir();
  try {
    await zip.extractAllTo(archivePath, tmpRoot, {
      useSystemUnzip,
      // https://github.com/appium/appium/issues/14100
      fileNamesEncoding: 'utf8',
    });
  } catch (e) {
    await fs.rimraf(tmpRoot);
    throw e;
  }
  return {
    rootDir: tmpRoot,
    archiveSize: (await fs.stat(archivePath)).size,
  };
}

/**
 * Unzips a ZIP archive from a stream.
 * Uses bdstar tool for this purpose.
 * This allows to optimize the time needed to prepare the app under test
 * to MAX(download, unzip) instead of SUM(download, unzip)
 */
export async function unzipStream(zipStream: Readable): Promise<UnzipInfo> {
  const tmpRoot = await tempDir.openDir();
  const bsdtarProcess = spawn(
    await fs.which('bsdtar'),
    ['-x', '--exclude', MACOS_RESOURCE_FOLDER, '--exclude', `${MACOS_RESOURCE_FOLDER}/*`, '-'],
    {
      cwd: tmpRoot,
    },
  );
  let archiveSize = 0;
  bsdtarProcess.stderr.on('data', (chunk) => {
    const stderr = chunk.toString();
    if (stderr.trim()) {
      log.warn(stderr);
    }
  });
  bsdtarProcess.stdin.on('error', (e) => {
    log.warn(`Error occurred while writing to bsdtar stdin: ${e.message}`);
  });
  zipStream.on('data', (chunk) => {
    archiveSize += chunk.length;
  });
  zipStream.pipe(bsdtarProcess.stdin);
  try {
    await new Promise<void>((resolve, reject) => {
      zipStream.once('error', reject);
      bsdtarProcess.once('exit', (code, signal) => {
        zipStream.unpipe(bsdtarProcess.stdin);
        log.debug(`bsdtar process exited with code ${code}, signal ${signal}`);
        if (code === 0) {
          resolve(undefined);
        } else {
          reject(new Error('Is it a valid ZIP archive?'));
        }
      });
      bsdtarProcess.once('error', (e) => {
        zipStream.unpipe(bsdtarProcess.stdin);
        reject(e);
      });
    });
  } catch (err: any) {
    bsdtarProcess.kill(9);
    await fs.rimraf(tmpRoot);
    throw new Error(`The response data cannot be unzipped: ${err.message}`, {cause: err});
  } finally {
    bsdtarProcess.removeAllListeners();
    zipStream.removeAllListeners();
  }
  return {
    rootDir: tmpRoot,
    archiveSize,
  };
}

/**
 * Builds Safari preferences object based on the given session capabilities
 */
export function buildSafariPreferences(opts: SafariPreferencesOpts & StringRecord): StringRecord {
  const safariSettings = structuredClone(opts?.safariGlobalPreferences ?? {});

  for (const [name, [aliases, valueConverter]] of Object.entries(SAFARI_OPTS_ALIASES_MAP)) {
    const optName = name as keyof typeof SAFARI_OPTS_ALIASES_MAP;
    if (!Object.hasOwn(opts, optName)) {
      continue;
    }

    for (const alias of aliases) {
      safariSettings[alias] = valueConverter(opts[optName]);
    }
  }
  return safariSettings;
}

/**
 * Looks for items with given extensions in the given folder.
 *
 * @param appPath Full path to an app bundle
 * @param appExtensions List of matching item extensions
 * @returns List of relative paths to matched items
 */
export async function findApps(appPath: string, appExtensions: string[]): Promise<string[]> {
  const globPattern = `**/*.+(${appExtensions.map((ext) => ext.replace(/^\./, '')).join('|')})`;
  const sortedBundleItems = (
    await fs.glob(globPattern, {
      cwd: appPath,
    })
  ).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return sortedBundleItems;
}

/**
 * Determines whether the app under test should be (re)installed, and whether an existing
 * installation should be uninstalled first.
 */
export async function checkAutInstallationState(
  driver: XCUITestDriver,
  opts?: AutInstallationStateOptions,
): Promise<AutInstallationState> {
  const {enforceAppInstall, fullReset, noReset, bundleId, app} = opts ?? driver.opts;

  const wasAppInstalled = !!bundleId && (await driver.device.isAppInstalled(bundleId));
  if (wasAppInstalled) {
    driver.log.info(`App '${bundleId}' is already installed`);
    if (noReset) {
      driver.log.info('noReset is requested. The app will not be (re)installed');
      return {
        install: false,
        skipUninstall: true,
      };
    }
  } else {
    driver.log.info(
      `App '${bundleId}' is not installed yet or it has an offload and ` +
        'cannot be detected, which might keep the local data.',
    );
  }
  if (enforceAppInstall !== false || fullReset || !wasAppInstalled) {
    return {
      install: true,
      skipUninstall: !wasAppInstalled,
    };
  }

  const candidateBundleVersion = app ? await driver.appInfosCache.extractBundleVersion(app) : undefined;
  driver.log.debug(`CFBundleVersion from Info.plist: ${candidateBundleVersion}`);
  if (!candidateBundleVersion) {
    return {
      install: true,
      skipUninstall: false,
    };
  }

  const appBundleVersion = (
    driver.isRealDevice()
      ? await (driver.device as RealDevice).fetchAppInfo(bundleId)
      : await (driver.device as Simulator).appInfo(bundleId)
  )?.CFBundleVersion;
  driver.log.debug(`CFBundleVersion from installed app info: ${appBundleVersion}`);
  if (!appBundleVersion) {
    return {
      install: true,
      skipUninstall: false,
    };
  }

  let shouldUpgrade: boolean;
  try {
    shouldUpgrade = util.compareVersions(candidateBundleVersion, '>', appBundleVersion);
  } catch (err) {
    driver.log.warn(`App versions comparison is not possible: ${(err as Error).message}`);
    return {
      install: true,
      skipUninstall: false,
    };
  }
  if (shouldUpgrade) {
    driver.log.info(
      `The installed version of ${bundleId} is lower than the candidate one ` +
        `(${candidateBundleVersion} > ${appBundleVersion}). The app will be upgraded.`,
    );
  } else {
    driver.log.info(
      `The candidate version of ${bundleId} is lower than the installed one ` +
        `(${candidateBundleVersion} <= ${appBundleVersion}). The app won't be reinstalled.`,
    );
  }
  return {
    install: shouldUpgrade,
    skipUninstall: true,
  };
}

/**
 * Installs the app under test (and any `otherApps`) onto the device, if needed.
 */
export async function installAUT(driver: XCUITestDriver): Promise<void> {
  // install any other apps
  if (driver.opts.otherApps) {
    await installOtherApps(driver, driver.opts.otherApps);
  }

  if (driver.isSafari() || !driver.opts.app) {
    return;
  }

  await verifyApplicationPlatform(driver);

  const {install, skipUninstall} = await checkAutInstallationState(driver);
  if (install) {
    if (driver.isRealDevice()) {
      await installToRealDevice.bind(driver)(driver.opts.app, driver.opts.bundleId, {
        skipUninstall,
        timeout: driver.opts.appPushTimeout,
      });
    } else {
      await installToSimulator.bind(driver)(driver.opts.app, driver.opts.bundleId, {
        skipUninstall,
        newSimulator: driver.lifecycleData?.createSim,
      });
    }
    if (util.hasValue(driver.opts.iosInstallPause)) {
      // https://github.com/appium/appium/issues/6889
      const pauseMs = driver.opts.iosInstallPause;
      driver.log.debug(`iosInstallPause set. Pausing ${pauseMs} ms before continuing`);
      await delay(pauseMs);
    }
    driver.logEvent('appInstalled');
  }
}

/**
 * The callback invoked by configureApp helper
 * when it is necessary to download the remote application.
 * We assume the remote file could be anythingm, but only
 * .zip and .ipa formats are supported.
 * A .zip archive can contain one or more
 *
 * @param scope What role the downloaded package plays in the session, fixed per call site by binding
 */
export async function onDownloadApp(
  this: XCUITestDriver,
  scope: WatchAppSelectionScope,
  opts: DownloadAppOptions,
): Promise<string> {
  return this.isRealDevice()
    ? await downloadIpa(this, opts.stream, opts.headers)
    : await unzipApp(this, opts.stream, scope);
}

/**
 * How much authority the session capabilities have over a package being configured.
 *
 * `appium:watchBundleId` and `appium:bundleId` name the application under test, so they must not
 * be applied to one of the `appium:otherApps` packages installed alongside it: doing so either
 * rejects a perfectly installable package for referencing another application, or selects a
 * bundle the user never pointed at with that capability.
 */
export type WatchAppSelectionScope =
  /** The package the session will drive: caps apply, and carrying no watch application is fatal. */
  | 'app-under-test'
  /** A package installed alongside the application under test: session caps do not apply to it. */
  | 'other-application';

/**
 * The callback invoked by configureApp helper
 *
 * @param scope What role the package being configured plays in the session. Fixed per call site by
 * binding, since the base driver only ever hands the hook its own argument.
 * @throws If a watchOS session is given a package it cannot drive, or one whose watch application
 * cannot be determined
 */
export async function onPostConfigureApp(
  this: XCUITestDriver,
  scope: WatchAppSelectionScope,
  opts: PostProcessOptions,
): Promise<PostProcessResult | undefined> {
  // Pick the previously cached entry if its integrity has been preserved
  const appInfo = isPlainObject(opts.cachedAppInfo) ? (opts.cachedAppInfo as CachedAppInfo) : undefined;
  const cachedPath = appInfo ? appInfo.fullPath : undefined;

  const shouldUseCachedApp = async () => {
    if (!appInfo || !cachedPath || !(await fs.exists(cachedPath))) {
      return false;
    }

    const isCachedPathAFile = (await fs.stat(cachedPath)).isFile();
    if (isCachedPathAFile) {
      return (await fs.hash(cachedPath)) === (appInfo.integrity as any)?.file;
    }
    // If the cached path is a folder then it is expected to be previously extracted from
    // an archive located under appPath whose hash is stored as `cachedAppInfo.packageHash`
    if (
      !isCachedPathAFile &&
      opts.cachedAppInfo?.packageHash &&
      opts.appPath &&
      (await fs.exists(opts.appPath)) &&
      (await fs.stat(opts.appPath)).isFile() &&
      opts.cachedAppInfo.packageHash === (await fs.hash(opts.appPath))
    ) {
      const nestedItemsCountInCache = (appInfo.integrity as any)?.folder;
      if (nestedItemsCountInCache !== undefined) {
        return (await fs.glob('**/*', {cwd: cachedPath})).length >= nestedItemsCountInCache;
      }
    }

    return false;
  };

  if (await shouldUseCachedApp()) {
    if (!cachedPath) {
      return undefined;
    }
    this.log.info(`Using '${cachedPath}' which was cached from '${opts.appPath || 'unknown'}'`);
    return {appPath: cachedPath};
  }

  if (!opts.appPath) {
    return undefined;
  }

  const isLocalIpa = await isIpaBundle(opts.appPath);
  const isLocalApp = !isLocalIpa && (await isAppBundle(opts.appPath));
  const isPackageReadyForInstall = isLocalApp || (this.isRealDevice() && isLocalIpa);
  if (isPackageReadyForInstall) {
    await this.appInfosCache.put(opts.appPath);
    const resolution = await resolveWatchAppBundle(this, opts.appPath, scope);
    if (resolution.kind === 'selected') {
      // The selected bundle lives inside the package provided by the user, which the driver must
      // never modify, while the base driver expects any application it has rewritten to be
      // disposable. Only archives are moved out of their temporary root by unzipApp.
      return {appPath: await copyAppBundle(resolution.fullPath)};
    }
    if (resolution.kind === 'missing') {
      throw missingWatchAppBundleError(resolution.appPath, resolution.companionWatchBundleId);
    }
  }
  // Only local .app bundles (real device/Simulator)
  // and .ipa packages for real devices should not be cached
  if (!opts.isUrl && isPackageReadyForInstall) {
    return undefined;
  }
  // Cache the app while unpacking the bundle if necessary
  return {
    appPath: isPackageReadyForInstall ? opts.appPath : await unzipApp(this, opts.appPath, scope),
  };
}

/**
 * Builds the `configureApp` options for a package with the given role in the session.
 *
 * The role is fixed per call site by binding because the base driver only ever hands the hooks its
 * own argument.
 */
export function configureAppOptions(driver: XCUITestDriver, scope: WatchAppSelectionScope): ConfigureAppOptions {
  return {
    onPostProcess: onPostConfigureApp.bind(driver, scope),
    onDownload: onDownloadApp.bind(driver, scope),
    supportedExtensions: SUPPORTED_EXTENSIONS,
  };
}

// Private functions
/** @returns The `CFBundleSupportedPlatforms` prefix (e.g. `AppleTVSimulator`/`AppleTVOS`) for the given platform. */
function getBundlePlatformPrefix(platformName: string | null | undefined): string {
  if (isTvOs(platformName)) {
    return 'AppleTV';
  }
  if (isWatchOs(platformName)) {
    return 'Watch';
  }
  return 'iPhone';
}

/**
 * The name of the folder where watchOS applications are packaged inside their
 * companion iOS application bundle.
 */
const WATCH_APPS_FOLDER = 'Watch';

/**
 * The maximum number of nested application bundles searched inside a `Watch` folder.
 * `Watch/Bar.app` and `Watch/Bar.app/Watch/Barkit.app` are supported, deeper bundles are not.
 */
const MAX_WATCH_BUNDLE_SCAN_DEPTH = 2;

/**
 * The outcome of looking for the watch application of a single application bundle.
 *
 * `missing` is distinct from `not-applicable` because only the former means the package can never
 * drive a watchOS session: `not-applicable` also covers sessions that are not watchOS ones and
 * bundles that already are watch applications.
 */
type WatchAppBundleResolution =
  | {kind: 'not-applicable'}
  | {kind: 'missing'; appPath: string; companionWatchBundleId?: string}
  | {kind: 'selected'; fullPath: string};

/**
 * @param appPath Full path to the outer application bundle that carries no watch application
 * @param companionWatchBundleId The watch application that bundle claims to own, if any
 * @returns The error explaining why the package cannot be used for a watchOS session
 * @remarks The alternative is leaving `opts.app` on the outer iOS bundle, where the platform check
 * rejects it as an architecture mismatch - which sends the user to rebuild a bundle that was fine,
 * instead of pointing at the watch payload that is missing from it.
 */
function missingWatchAppBundleError(appPath: string, companionWatchBundleId?: string): Error {
  return new Error(
    `'${path.basename(appPath)}' has been provided as the application under test for a watchOS ` +
      `session, but it is not a watchOS application bundle and its '${WATCH_APPS_FOLDER}' folder ` +
      `contains no watchOS application bundle either${
        isEmpty(companionWatchBundleId)
          ? ''
          : `, although it declares '${companionWatchBundleId}' as the watch application it owns`
      }. Provide a package that contains the watch application to test.`,
  );
}

/**
 * Finds the watch application a watchOS session must use inside a single application bundle.
 *
 * WatchOS applications are usually distributed inside their companion iOS application
 * (`Payload/Foo.app/Watch/FooWatch.app`), which makes the outer bundle incompatible with the
 * watchOS Simulator. For watchOS sessions nested watch applications are discovered and selected,
 * so that the rest of the startup flow (platform verification, installation, `appium:bundleId`
 * resolution) only ever sees the watch application.
 *
 * @param driver The driver that owns the session
 * @param appPath Full path to the application bundle being configured
 * @param scope What role `appPath` plays in the session
 * @throws If the nested watch applications cannot be reduced to exactly one
 */
async function resolveWatchAppBundle(
  driver: XCUITestDriver,
  appPath: string,
  scope: WatchAppSelectionScope,
): Promise<WatchAppBundleResolution> {
  if (!isWatchOs(driver.opts.platformName) || !(await isAppBundle(appPath))) {
    return {kind: 'not-applicable'};
  }

  let outerAppInfo: WatchAppInfo;
  try {
    outerAppInfo = await driver.appInfosCache.extractWatchAppInfo(appPath);
  } catch (e: any) {
    driver.log.debug(e.message);
    return {kind: 'not-applicable'};
  }

  const prefix = getBundlePlatformPrefix(driver.opts.platformName);
  if (outerAppInfo.platforms.some((platform) => platform.startsWith(prefix))) {
    driver.log.debug(`'${appPath}' is already a ${prefix} application bundle`);
    return {kind: 'not-applicable'};
  }

  // Session capabilities name the application under test, so they never apply to a package
  // installed alongside it.
  const sessionCapsApply = scope === 'app-under-test';
  const watchAppBundles = await findWatchAppBundles(driver, appPath);
  if (isEmpty(watchAppBundles)) {
    if (!isEmpty(outerAppInfo.companionWatchBundleId)) {
      driver.log.info(
        `'${path.basename(appPath)}' declares '${outerAppInfo.companionWatchBundleId}' as the watch ` +
          `application it owns, but no such bundle is packaged in its '${WATCH_APPS_FOLDER}' folder`,
      );
    }
    return sessionCapsApply
      ? {kind: 'missing', appPath, companionWatchBundleId: outerAppInfo.companionWatchBundleId}
      : // A package installed alongside the application under test may legitimately be an iOS-only
        // one, for example the companion of the watch application under test.
        {kind: 'not-applicable'};
  }

  const selected = chooseWatchAppBundle(
    driver,
    appPath,
    watchAppBundles,
    outerAppInfo.companionWatchBundleId,
    sessionCapsApply,
  );
  const {bundleId: bundleIdCap} = driver.opts;
  if (sessionCapsApply && bundleIdCap && selected.bundleId !== bundleIdCap) {
    throw new Error(
      `The 'appium:bundleId' capability ('${bundleIdCap}') does not reference the ` +
        `'${selected.bundleId}' watchOS application resolved from '${path.basename(appPath)}'. Set ` +
        `'appium:bundleId' to '${selected.bundleId}' to test the watch application, or remove it to let ` +
        `the driver detect the bundle identifier automatically.`,
    );
  }
  driver.log.info(`The '${selected.relativePath}' watchOS application has been selected for this session`);
  if (!selected.isStandalone && !isEmpty(selected.companionAppBundleId)) {
    driver.log.warn(
      `Only the '${selected.bundleId}' watchOS application is going to be installed. It declares ` +
        `'${selected.companionAppBundleId}' as its companion iOS application, which cannot be installed ` +
        `on the watch itself and must be provisioned separately, for example in a dedicated iOS session, ` +
        `if the watch application needs it.`,
    );
  }
  return {kind: 'selected', fullPath: selected.fullPath};
}

/**
 * Collects the watch application bundles packaged in the standard `Watch` folder of the given
 * application bundle.
 *
 * @param driver The driver that owns the session
 * @param appPath Full path to the outer application bundle root
 * @returns The discovered watch application bundles, ordered by their nesting depth
 */
async function findWatchAppBundles(driver: XCUITestDriver, appPath: string): Promise<WatchAppBundleCandidate[]> {
  const watchAppsRoot = path.join(appPath, WATCH_APPS_FOLDER);
  if (!(await fs.exists(watchAppsRoot))) {
    return [];
  }

  const prefix = getBundlePlatformPrefix(driver.opts.platformName);
  const result: WatchAppBundleCandidate[] = [];
  for (const matchedPath of await findApps(watchAppsRoot, SUPPORTED_EXTENSIONS)) {
    if (countAppBundleComponents(matchedPath) > MAX_WATCH_BUNDLE_SCAN_DEPTH) {
      driver.log.debug(
        `'${matchedPath}' is nested deeper than ${MAX_WATCH_BUNDLE_SCAN_DEPTH} application ` + `bundles. Skipping it`,
      );
      continue;
    }
    const fullPath = path.join(watchAppsRoot, matchedPath);
    if (!(await isAppBundle(fullPath))) {
      driver.log.debug(`'${matchedPath}' is not an application bundle. Skipping it`);
      continue;
    }
    let appInfo: WatchAppInfo;
    try {
      appInfo = await driver.appInfosCache.extractWatchAppInfo(fullPath);
    } catch (e: any) {
      driver.log.info(e.message);
      continue;
    }
    if (!appInfo.platforms.some((platform) => platform.startsWith(prefix))) {
      driver.log.info(
        `'${matchedPath}' does not support ${prefix} devices in the list of its supported ` +
          `platforms (${appInfo.platforms.join(',')}). Skipping it`,
      );
      continue;
    }
    result.push({
      bundleId: appInfo.bundleId,
      companionAppBundleId: appInfo.companionAppBundleId,
      fullPath,
      isStandalone: appInfo.isStandalone,
      relativePath: path.join(WATCH_APPS_FOLDER, matchedPath),
    });
  }
  return result;
}

/**
 * @param candidate A discovered watch application bundle
 * @param value A bundle identifier, or a path referencing a watch application bundle
 * @param appPath Full path to the outer application bundle root
 * @param allowPaths Whether `value` may also reference the bundle by path. Only
 * `appium:watchBundleId` is documented as taking a path; every other reference
 * (`appium:bundleId`, `WKWatch1To1CompanionKey`) is an identifier, and accepting a path there
 * would make `appium:bundleId` select a bundle instead of naming the bundle the session expects,
 * which the checks on its value rely on.
 * @returns Whether `value` references the given watch application bundle
 * @remarks Paths are accepted in every form the selection errors print them, plus the absolute
 * path a caller may have taken from a directory listing: `Watch/Bar.app`, `Bar.app`,
 * `Foo.app/Watch/Bar.app`, and `/anywhere/Foo.app/Watch/Bar.app`.
 */
function isWatchAppBundleReferencedBy(
  candidate: WatchAppBundleCandidate,
  value: string,
  appPath: string,
  allowPaths: boolean,
): boolean {
  if (candidate.bundleId === value) {
    return true;
  }
  if (!allowPaths) {
    return false;
  }
  const reference = value
    .split(path.sep)
    .join(path.posix.sep)
    .replace(/^\.?\//, '');
  const relativePath = candidate.relativePath.split(path.sep).join(path.posix.sep);
  return (
    reference === relativePath ||
    reference === path.posix.basename(relativePath) ||
    reference === `${path.basename(appPath)}/${relativePath}` ||
    reference.endsWith(`/${relativePath}`)
  );
}

/**
 * Reduces the discovered watch application bundles to the single one to use.
 *
 * `appium:watchBundleId` wins over `appium:bundleId`, which in turn wins over the
 * `WKWatch1To1CompanionKey` reference of the outer application. Only `appium:watchBundleId`
 * accepts a path; the other two are identifiers.
 *
 * @param driver The driver that owns the session
 * @param appPath Full path to the outer application bundle root
 * @param candidates The discovered watch application bundles
 * @param companionWatchBundleId The watch application the outer application claims to own
 * @param sessionCapsApply Whether the session capabilities may disambiguate the candidates
 * @returns The bundle to use
 * @throws If the candidates cannot be reduced to a single one
 */
function chooseWatchAppBundle(
  driver: XCUITestDriver,
  appPath: string,
  candidates: WatchAppBundleCandidate[],
  companionWatchBundleId: string | undefined,
  sessionCapsApply: boolean,
): WatchAppBundleCandidate {
  const {bundleId: bundleIdCap, watchBundleId}: WatchAppSessionOpts = driver.opts;
  const describeCandidates = (items: WatchAppBundleCandidate[]) =>
    items.map((item) => `'${item.bundleId}' (${path.join(path.basename(appPath), item.relativePath)})`).join(', ');
  const matchesIdentifier = (value: string) =>
    candidates.filter((candidate) => isWatchAppBundleReferencedBy(candidate, value, appPath, false));

  if (sessionCapsApply && watchBundleId) {
    const matches = candidates.filter((candidate) =>
      isWatchAppBundleReferencedBy(candidate, watchBundleId, appPath, true),
    );
    if (matches.length === 1) {
      return matches[0];
    }
    throw new Error(
      isEmpty(matches)
        ? `The 'appium:watchBundleId' capability has been set to '${watchBundleId}', which matches none of ` +
            `the watchOS application bundles of '${path.basename(appPath)}': ${describeCandidates(candidates)}. ` +
            `Use the bundle identifier or the path of one of them.`
        : `The 'appium:watchBundleId' capability has been set to '${watchBundleId}', which matches multiple ` +
            `watchOS application bundles: ${describeCandidates(matches)}. Use the bundle identifier or the ` +
            `exact relative path to select only one of them.`,
    );
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (sessionCapsApply && bundleIdCap) {
    const matches = matchesIdentifier(bundleIdCap);
    if (matches.length === 1) {
      driver.log.info(
        `Selecting the watchOS application that matches the 'appium:bundleId' capability ` + `('${bundleIdCap}')`,
      );
      return matches[0];
    }
  }

  if (companionWatchBundleId) {
    const matches = matchesIdentifier(companionWatchBundleId);
    if (matches.length === 1) {
      driver.log.info(
        `Selecting '${companionWatchBundleId}', the watchOS application the ` +
          `'${path.basename(appPath)}' application declares in its 'WKWatch1To1CompanionKey' key`,
      );
      return matches[0];
    }
  }

  throw new Error(
    `Found ${util.pluralize('watchOS application bundle', candidates.length, true)} in ` +
      `'${path.basename(appPath)}': ${describeCandidates(candidates)}. ` +
      (sessionCapsApply
        ? `Set the 'appium:watchBundleId' capability to one of the paths above, or 'appium:bundleId' to ` +
          `one of the identifiers above, to select the watch application to test.`
        : `Only one of them can be installed at a time. Provide the application under test as ` +
          `'appium:app', where 'appium:watchBundleId' selects between these, or install the ` +
          `watch application bundle of your choice directly.`),
  );
}

/**
 * @param relativePath Path relative to a `Watch` folder
 * @returns The number of application bundle components in the given path
 */
function countAppBundleComponents(relativePath: string): number {
  return relativePath.split(path.sep).filter((component) => component.toLowerCase().endsWith(APP_EXT)).length;
}

/**
 * Verify whether the given application is compatible to the
 * platform where it is going to be installed and tested.
 *
 * @throws If bundle architecture does not match the expected device architecture.
 */
async function verifyApplicationPlatform(driver: XCUITestDriver): Promise<void> {
  driver.log.debug('Verifying application platform');

  if (!driver.opts.app) {
    return;
  }

  const supportedPlatforms = await driver.appInfosCache.extractAppPlatforms(driver.opts.app);
  const prefix = getBundlePlatformPrefix(driver.opts.platformName);
  const suffix = driver.isSimulator() ? 'Simulator' : 'OS';
  const dstPlatform = `${prefix}${suffix}`;
  if (!supportedPlatforms.includes(dstPlatform)) {
    throw new Error(
      `${
        driver.isSimulator() ? 'Simulator' : 'Real device'
      } architecture is not supported by the ${driver.opts.bundleId} application. ` +
        `Make sure the correct deployment target has been selected for its compilation in Xcode.`,
    );
  }
  if (driver.isRealDevice()) {
    return;
  }

  const executablePath = path.resolve(
    driver.opts.app,
    await driver.appInfosCache.extractExecutableName(driver.opts.app),
  );
  const [resFile, resUname] = await Promise.all([exec('lipo', ['-info', executablePath]), exec('uname', ['-m'])]);
  const bundleExecutableInfo = resFile.stdout.trim();
  driver.log.debug(bundleExecutableInfo);
  const processArch = resUname.stdout.trim();
  driver.log.debug(`Current process architecture: ${processArch}`);
  const isAppleSiliconCpu = isAppleSilicon();
  driver.log.debug(`Is Apple Silicon CPU: ${isAppleSiliconCpu}`);
  if (isAppleSiliconCpu && processArch === INTEL_ARCH) {
    driver.log.warn(
      `It looks like the Appium server process is running under Rosetta emulation. ` +
        `This might lead to various performance/compatibility issues while running tests on Simulator. ` +
        `Consider using binaries compiled natively for the ARM64 architecture to run Appium server ` +
        `with this driver.`,
    );
  }
  if (bundleExecutableInfo.includes(processArch)) {
    return;
  }
  const hasRosetta = isAppleSiliconCpu && (await isRosettaInstalled());
  const isIntelApp = bundleExecutableInfo.includes(INTEL_ARCH);
  // We cannot run Simulator builds compiled for arm64 on Intel machines
  // Rosetta allows only to run Intel ones on arm64
  if ((isIntelApp && (!isAppleSiliconCpu || hasRosetta)) || (!isIntelApp && isAppleSiliconCpu)) {
    return;
  }
  const advice =
    isIntelApp && isAppleSiliconCpu && !hasRosetta
      ? `Please install Rosetta and try again.`
      : `Please rebuild your application to support the ${processArch} platform.`;
  throw new Error(
    `The ${driver.opts.bundleId} application does not support the ${processArch} Simulator ` +
      `architecture:\n${bundleExecutableInfo}\n\n${advice}`,
  );
}

/**
 * Installs each app listed in the `otherApps` capability onto the device.
 */
async function installOtherApps(driver: XCUITestDriver, otherApps: string | string[]): Promise<void> {
  let appsList: string[] | undefined;
  try {
    appsList = driver.helpers.parseCapsArray(otherApps);
  } catch (e) {
    throw driver.log.errorWithException(`Could not parse "otherApps" capability: ${(e as Error).message}`);
  }
  if (!appsList?.length) {
    driver.log.info(`Got zero apps from 'otherApps' capability value. Doing nothing`);
    return;
  }

  const appPaths: string[] = await Promise.all(
    appsList.map((app) => driver.helpers.configureApp(app, configureAppOptions(driver, 'other-application'))),
  );
  const appIds: string[] = await Promise.all(appPaths.map((appPath) => driver.appInfosCache.extractBundleId(appPath)));
  for (const [appId, appPath] of appIds.map((v, i) => [v, appPaths[i]] as const)) {
    if (driver.isRealDevice()) {
      await installToRealDevice.bind(driver)(appPath, appId, {
        skipUninstall: true, // to make the behavior as same as UIA2
        timeout: driver.opts.appPushTimeout,
      });
    } else {
      await installToSimulator.bind(driver)(appPath, appId, {
        newSimulator: driver.lifecycleData.createSim,
      });
    }
  }
}

/**
 * Check whether the given path on the file system points to the .app bundle root
 *
 * @param appPath Possible .app bundle root
 * @returns Whether the given path points to an .app bundle
 */
async function isAppBundle(appPath: string): Promise<boolean> {
  return (
    appPath.toLowerCase().endsWith(APP_EXT) &&
    (await fs.stat(appPath)).isDirectory() &&
    (await fs.exists(path.join(appPath, 'Info.plist')))
  );
}

/**
 * Check whether the given path on the file system points to the .ipa file
 *
 * @param appPath Possible .ipa file
 * @returns Whether the given path points to an .ipa bundle
 */
async function isIpaBundle(appPath: string): Promise<boolean> {
  return appPath.toLowerCase().endsWith(IPA_EXT) && (await fs.stat(appPath)).isFile();
}

/**
 * Used to parse the file name value from response headers
 */
function parseFileName(headers: HTTPHeaders): string | null {
  const contentDisposition = headers['content-disposition'];
  if (typeof contentDisposition !== 'string') {
    return null;
  }

  if (/^attachment/i.test(contentDisposition)) {
    const match = /filename="([^"]+)/i.exec(contentDisposition);
    if (match) {
      return fs.sanitizeName(match[1], {replacement: SANITIZE_REPLACEMENT});
    }
  }
  return null;
}

/**
 * Downloads and verifies remote applications for real devices
 */
async function downloadIpa(driver: XCUITestDriver, stream: Readable, headers: HTTPHeaders): Promise<string> {
  const timer = new timing.Timer().start();

  const logPerformance = (dstPath: string, fileSize: number, action: string) => {
    const secondsElapsed = timer.getDuration().asSeconds;
    driver.log.info(
      `The remote file (${util.toReadableSizeString(fileSize)}) ` +
        `has been ${action} to '${dstPath}' in ${secondsElapsed.toFixed(3)}s`,
    );
    if (secondsElapsed >= 1) {
      const bytesPerSec = Math.floor(fileSize / secondsElapsed);
      driver.log.debug(`Approximate speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
    }
  };

  // Check if the file to be downloaded is a .zip rather than .ipa
  const fileName = parseFileName(headers) ?? `appium-app-${new Date().getTime()}${IPA_EXT}`;
  if (fileName.toLowerCase().endsWith(ZIP_EXT)) {
    const {rootDir, archiveSize} = await unzipStream(stream);
    logPerformance(rootDir, archiveSize, 'downloaded and unzipped');
    try {
      const matchedPaths = await findApps(rootDir, [IPA_EXT]);
      if (!isEmpty(matchedPaths)) {
        driver.log.debug(
          `Found ${util.pluralize(`${IPA_EXT} application`, matchedPaths.length, true)} in ` +
            `'${path.basename(rootDir)}': ${matchedPaths}`,
        );
      }
      for (const matchedPath of matchedPaths) {
        const fullPath = path.join(rootDir, matchedPath);
        try {
          await driver.appInfosCache.put(fullPath);
        } catch (e: any) {
          driver.log.info(e.message);
          continue;
        }
        driver.log.debug(`Selecting the application at '${matchedPath}'`);
        const isolatedPath = path.join(await tempDir.openDir(), path.basename(fullPath));
        await fs.mv(fullPath, isolatedPath);
        return isolatedPath;
      }
      throw new Error(`The remote archive does not contain any valid ${IPA_EXT} applications`);
    } finally {
      await fs.rimraf(rootDir);
    }
  }

  const ipaPath = await tempDir.path({
    prefix: fileName,
    suffix: fileName.toLowerCase().endsWith(IPA_EXT) ? '' : IPA_EXT,
  });
  try {
    const writer = fs.createWriteStream(ipaPath);
    stream.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      stream.once('error', reject);
      writer.once('finish', resolve);
      writer.once('error', (e) => {
        stream.unpipe(writer);
        reject(e);
      });
    });
  } catch (err: any) {
    throw new Error(`Cannot fetch the remote file: ${err.message}`, {cause: err});
  }
  const {size} = await fs.stat(ipaPath);
  logPerformance(ipaPath, size, 'downloaded');
  try {
    await driver.appInfosCache.put(ipaPath);
  } catch (e) {
    await fs.rimraf(ipaPath);
    throw e;
  }
  return ipaPath;
}

/**
 * Moves the application bundle to a newly created temporary folder
 *
 * @param appPath Full path to the .app or .ipa bundle
 * @returns The new path to the app bundle.
 * The name of the app bundle remains the same
 */
async function isolateApp(appPath: string): Promise<string> {
  const appFileName = path.basename(appPath);
  if ((await fs.stat(appPath)).isFile()) {
    const isolatedPath = await tempDir.path({
      prefix: appFileName,
      suffix: '',
    });
    await fs.mv(appPath, isolatedPath, {mkdirp: true});
    return isolatedPath;
  }

  const tmpRoot = await tempDir.openDir();
  const isolatedRoot = path.join(tmpRoot, appFileName);
  await fs.mv(appPath, isolatedRoot, {mkdirp: true});
  return isolatedRoot;
}

/**
 * Creates a disposable copy of an application bundle in a temporary folder.
 *
 * @param appPath Full path to the application bundle to copy
 * @returns Full path to the copied bundle
 */
async function copyAppBundle(appPath: string): Promise<string> {
  const tmpRoot = await tempDir.openDir();
  const copiedPath = path.join(tmpRoot, path.basename(appPath));
  // `ditto` is the canonical way of copying macOS application bundles: unlike a plain recursive
  // copy it keeps symlinks and bundle metadata intact. It is a macOS-only tool, and `fs.which`
  // rejects rather than returning null when an executable is absent, hence the explicit catch.
  const dittoPath = await fs.which('ditto').catch(() => null);
  if (dittoPath) {
    await exec(dittoPath, [appPath, copiedPath]);
    return copiedPath;
  }
  // The driver also runs on Linux and Windows hosts, where no `ditto` exists. `verbatimSymlinks`
  // is required, not cosmetic: without it `fs.cp` rewrites each link target, measured to turn
  // `Versions/Current -> A` into an absolute path back into the *source* bundle, so the copy would
  // no longer be self-contained and the installed app would break when that temp dir is cleaned.
  await cp(appPath, copiedPath, {recursive: true, verbatimSymlinks: true});
  return copiedPath;
}

/**
 * Finds the watch application a watchOS session must use in an extracted archive.
 *
 * Nested bundles are reported as `Payload/Foo.app/Watch/FooWatch.app`, so each match is resolved
 * to the outermost application bundle owning it before the actual selection happens. This keeps
 * the disambiguation rules identical to the ones used for bundles present on the file system.
 *
 * @param driver The driver that owns the session
 * @param rootDir Full path to the extracted archive root
 * @param matchedPaths Paths of the bundles found in the archive, relative to `rootDir`
 * @param scope What role the archive plays in the session
 * @returns The selected watch application, the outermost application that should have carried one,
 * or `none` if no application in the archive wanted a watch application at all - which means the
 * archive holds a watch application directly and needs no rewriting
 * @throws If the nested watch applications cannot be reduced to exactly one
 */
async function resolveWatchAppBundleFromArchive(
  driver: XCUITestDriver,
  rootDir: string,
  matchedPaths: string[],
  scope: WatchAppSelectionScope,
): Promise<WatchAppBundleResolution | {kind: 'none'}> {
  const visitedAppPaths = new Set<string>();
  let missing: WatchAppBundleResolution | undefined;
  for (const matchedPath of matchedPaths) {
    const outerAppPath = path.join(rootDir, findOwningAppBundlePath(matchedPath));
    if (visitedAppPaths.has(outerAppPath)) {
      continue;
    }
    visitedAppPaths.add(outerAppPath);
    const resolution = await resolveWatchAppBundle(driver, outerAppPath, scope);
    if (resolution.kind === 'selected') {
      return resolution;
    }
    missing ??= resolution.kind === 'missing' ? resolution : undefined;
  }
  return missing ?? {kind: 'none'};
}

/**
 * @param matchedPath Path to an application bundle relative to an extracted archive root
 * @returns The path, relative to the same root, of the outermost application bundle owning the
 * given bundle, which is the bundle itself unless it is packaged in the `Watch` folder of another bundle
 */
function findOwningAppBundlePath(matchedPath: string): string {
  const components = matchedPath.split(path.sep);
  const watchFolderIndex = components.lastIndexOf(WATCH_APPS_FOLDER);
  const ownerIndex = watchFolderIndex - 1;
  return ownerIndex >= 0 && components[ownerIndex].toLowerCase().endsWith(APP_EXT)
    ? components.slice(0, ownerIndex + 1).join(path.sep)
    : matchedPath;
}

/**
 * Unzip the given archive and find a matching .app bundle in it
 *
 * @param appPathOrZipStream The path to the archive.
 * @param depth [0] the current nesting depth. App bundles whose nesting level
 * is greater than 1 are not supported.
 * @param scope What role the archive plays in the session
 * @returns Full path to the first matching .app bundle..
 * @throws If no matching .app bundles were found in the provided archive, or if the watch
 * application of a watchOS session cannot be determined from it.
 */
async function unzipApp(
  driver: XCUITestDriver,
  appPathOrZipStream: string | Readable,
  scope: WatchAppSelectionScope,
  depth: number = 0,
): Promise<string> {
  const errMsg =
    `The archive did not have any matching ${APP_EXT} or ${IPA_EXT} ` +
    `bundles. Please make sure the provided package is valid and contains at least one matching ` +
    `application bundle which is not nested.`;
  if (depth > MAX_ARCHIVE_SCAN_DEPTH) {
    throw new Error(errMsg);
  }

  const timer = new timing.Timer().start();
  let rootDir: string;
  let archiveSize: number;
  try {
    if (typeof appPathOrZipStream === 'string') {
      ({rootDir, archiveSize} = await unzipFile(appPathOrZipStream));
    } else {
      if (depth > 0) {
        assert.fail('Streaming unzip cannot be invoked for nested archive items');
      }
      ({rootDir, archiveSize} = await unzipStream(appPathOrZipStream));
    }
  } catch (e: any) {
    driver.log.debug(e.stack);
    throw new Error(`Cannot prepare the application for testing. Original error: ${e.message}`, {
      cause: e,
    });
  }
  const secondsElapsed = timer.getDuration().asSeconds;
  driver.log.info(
    `The file (${util.toReadableSizeString(archiveSize)}) ` +
      `has been ${typeof appPathOrZipStream === 'string' ? 'extracted' : 'downloaded and extracted'} ` +
      `to '${rootDir}' in ${secondsElapsed.toFixed(3)}s`,
  );
  // it does not make much sense to approximate the speed for short downloads
  if (secondsElapsed >= 1) {
    const bytesPerSec = Math.floor(archiveSize / secondsElapsed);
    driver.log.debug(`Approximate decompression speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
  }

  const isCompatibleWithCurrentPlatform = async (appPath: string) => {
    let platforms: string[];
    try {
      platforms = await driver.appInfosCache.extractAppPlatforms(appPath);
    } catch (e: any) {
      driver.log.info(e.message);
      return false;
    }
    if (driver.isSimulator() && !platforms.some((p) => p.includes('Simulator'))) {
      driver.log.info(
        `'${appPath}' does not have Simulator devices in the list of supported platforms ` +
          `(${platforms.join(',')}). Skipping it`,
      );
      return false;
    }
    if (driver.isRealDevice() && !platforms.some((p) => p.includes('OS'))) {
      driver.log.info(
        `'${appPath}' does not have real devices in the list of supported platforms ` +
          `(${platforms.join(',')}). Skipping it`,
      );
      return false;
    }
    return true;
  };

  const matchedPaths = await findApps(rootDir, SUPPORTED_EXTENSIONS);
  if (isEmpty(matchedPaths)) {
    driver.log.debug(`'${path.basename(rootDir)}' has no bundles`);
  } else {
    driver.log.debug(
      `Found ${util.pluralize('bundle', matchedPaths.length, true)} in ` +
        `'${path.basename(rootDir)}': ${matchedPaths}`,
    );
  }
  try {
    if (isWatchOs(driver.opts.platformName)) {
      const resolution = await resolveWatchAppBundleFromArchive(driver, rootDir, matchedPaths, scope);
      if (resolution.kind === 'selected') {
        driver.log.debug(`Selecting the watchOS application at '${resolution.fullPath}'`);
        return await isolateApp(resolution.fullPath);
      }
      if (resolution.kind === 'missing' && scope === 'app-under-test') {
        // No outer application of this archive carries the watch application the session needs, so
        // the generic loop below would pick an incompatible bundle and report an architecture
        // mismatch instead of the missing watch payload.
        throw missingWatchAppBundleError(resolution.appPath, resolution.companionWatchBundleId);
      }
    }
    for (const matchedPath of matchedPaths) {
      const fullPath = path.join(rootDir, matchedPath);
      if (
        ((await isAppBundle(fullPath)) || (driver.isRealDevice() && (await isIpaBundle(fullPath)))) &&
        (await isCompatibleWithCurrentPlatform(fullPath))
      ) {
        driver.log.debug(`Selecting the application at '${matchedPath}'`);
        return await isolateApp(fullPath);
      }
    }
  } finally {
    await fs.rimraf(rootDir);
  }
  throw new Error(errMsg);
}

async function isRosettaInstalled(): Promise<boolean> {
  return await fs.exists('/Library/Apple/usr/share/rosetta/rosetta');
}

function isAppleSilicon(): boolean {
  return os.cpus()[0].model.includes('Apple');
}
