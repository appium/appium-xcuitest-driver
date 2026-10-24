import assert from 'node:assert';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
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
  const matched = await fs.glob(globPattern, {
    cwd: appPath,
  });
  // Shallower bundles win, and bundles at the same depth are ordered by path: the glob result
  // order is filesystem-dependent, and callers pick the first compatible match.
  return matched.sort(
    (a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b, 'en', {sensitivity: 'base'}),
  );
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
    // Every session validates the entry, not only watchOS ones: the base driver keys its cache on
    // the package the session was given, so an entry a watchOS session produced by extracting a
    // nested watch application is also offered to an iOS or tvOS session pointing `appium:app` at
    // the same package, which would then install a bundle of another platform.
    if (await isCachedAppReusable(this, scope, cachedPath)) {
      this.log.info(`Using '${cachedPath}' which was cached from '${opts.appPath || 'unknown'}'`);
      return {appPath: cachedPath};
    }
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
      // never modify. Only archives are moved out of their temporary root by `unzipApp`.
      return {appPath: await copyAppBundle(this, resolution.candidate, opts.originalAppLink ?? opts.appPath)};
    }
    if (resolution.kind === 'missing') {
      throw missingWatchAppBundleError(resolution.appPath, resolution.companionWatchBundleId);
    }
    if (resolution.kind === 'unmatched') {
      // The user provided this single bundle, so it is the only owner that could hold the
      // requested watch application.
      throw unmatchedWatchAppBundleError(this, resolution.owners);
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
 * bundles whose manifest cannot be read. `watch-app` means the bundle itself already is the watch
 * application this session wants. `unmatched` means this particular bundle owns watch applications,
 * just not the one `appium:watchBundleId` names - another bundle of the same archive may own it, so
 * only the caller that has asked every owner may report it.
 */
type WatchAppBundleResolution =
  | {kind: 'not-applicable'}
  | {kind: 'watch-app'; candidate: WatchAppBundleCandidate}
  | {kind: 'missing'; appPath: string; companionWatchBundleId?: string}
  | {kind: 'unmatched'; owners: UnmatchedWatchAppOwner[]}
  | {kind: 'selected'; candidate: WatchAppBundleCandidate};

/**
 * What scanning an archive adds to the verdict about a single bundle: no application of the archive
 * wanted a watch application at all, so the archive holds one directly and needs no rewriting.
 * @remarks An archive never reports `watch-app`: a bundle that already is this session's application
 * is one of the bundles the archive offers, so the scan counts it as a selection and lets the
 * ambiguity rules below apply to it like to any other.
 */
type ArchiveWatchAppBundleResolution = Exclude<WatchAppBundleResolution, {kind: 'watch-app'}> | {kind: 'none'};

/** An outer application that owns watch applications, none of them the one requested. */
type UnmatchedWatchAppOwner = {appPath: string; candidates: WatchAppBundleCandidate[]};

/**
 * @param driver The driver that owns the session
 * @param owners Every outer application that was asked, and what each of them owns
 * @returns The error explaining that no watch application of the package matches the capability
 */
function unmatchedWatchAppBundleError(driver: XCUITestDriver, owners: UnmatchedWatchAppOwner[]): Error {
  return new Error(
    `The 'appium:watchBundleId' capability has been set to '${driver.opts.watchBundleId}', which ` +
      `matches none of the watchOS application bundles this package provides: ` +
      `${describeWatchAppBundleCandidates(owners)}. Use the bundle identifier or the path of one of them.`,
  );
}

/**
 * The error for a package holding more than one watch application the session could use.
 *
 * @param driver The driver that owns the session
 * @param owners The applications each offering one usable watch application
 * @param sessionCapsApply Whether the session capabilities may disambiguate them
 * @returns The error listing every candidate, as `docs/reference/capabilities.md` promises
 */
function multipleWatchAppsError(
  driver: XCUITestDriver,
  owners: UnmatchedWatchAppOwner[],
  sessionCapsApply: boolean,
): Error {
  const described = describeWatchAppBundleCandidates(owners);
  const {watchBundleId} = driver.opts;
  if (!isEmpty(watchBundleId)) {
    return new Error(
      `The 'appium:watchBundleId' capability has been set to '${watchBundleId}', which matches ` +
        `multiple watchOS application bundles: ${described}. Use the bundle identifier or the exact ` +
        `relative path to select only one of them.`,
    );
  }
  return new Error(
    `Found ${util.pluralize('watchOS application bundle', owners.length, true)} in the applications ` +
      `this package provides: ${described}. ` +
      (sessionCapsApply
        ? `Set the 'appium:watchBundleId' capability to one of the paths above, or 'appium:bundleId' ` +
          `to one of the identifiers above, to select the watch application to test.`
        : `Only one of them can be installed at a time. Provide the application under test as ` +
          `'appium:app', where 'appium:watchBundleId' selects between these, or install the ` +
          `watch application bundle of your choice directly.`),
  );
}

/**
 * @param owners Outer applications and the watch applications each of them owns
 * @returns Every candidate described the way the selection errors print it, so that a path copied
 * out of a message is one `appium:watchBundleId` accepts
 */
function describeWatchAppBundleCandidates(owners: UnmatchedWatchAppOwner[]): string {
  return owners
    .flatMap(({appPath, candidates}) =>
      candidates.map(
        ({bundleId, relativePath}) => `'${bundleId}' (${path.join(path.basename(appPath), relativePath)})`,
      ),
    )
    .join(', ');
}

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
 * Decides whether a cached extraction of a package may serve this session.
 *
 * The base driver keys its application cache on the path of the provided package, yet what a
 * package yields also depends on the session: a watchOS session hands back a nested watch
 * application, so the entry holds whichever bundle the session that unpacked the package *first*
 * happened to select, and an entry left behind by a watchOS session hands an iOS or tvOS session a
 * bundle whose `CFBundleSupportedPlatforms` it cannot satisfy - on a Simulator that surfaces as
 * `Simulator architecture is not supported by the com.acme.foo.watchapp application`, and on a real
 * device the driver would install a Simulator watch bundle. Every session therefore asks the cached
 * bundle what it is instead of trusting the key it is stored under.
 *
 * @param driver The driver that owns the session
 * @param scope What role the package plays in the session
 * @param cachedPath Full path of the cached application
 * @returns Whether the cached application is the one this session needs
 * @remarks Packages installed alongside the application under test are only checked for their
 * platform: the session capabilities never steer them, so no ambiguity can arise from them.
 */
async function isCachedAppReusable(
  driver: XCUITestDriver,
  scope: WatchAppSelectionScope,
  cachedPath: string,
): Promise<boolean> {
  let info: WatchAppInfo;
  try {
    info = await driver.appInfosCache.extractWatchAppInfo(cachedPath);
  } catch (e: any) {
    // An entry whose manifest cannot be read may be anything a previous session left behind, and
    // the only safe answer is to unpack the package again for this session.
    driver.log.debug(`Cannot inspect the cached application at '${cachedPath}': ${e.message}`);
    return false;
  }

  const prefix = getBundlePlatformPrefix(driver.opts.platformName);
  if (!info.platforms.some((platform) => platform.startsWith(prefix))) {
    driver.log.info(
      `Ignoring the cached '${cachedPath}': the '${info.bundleId}' application it holds does not ` +
        `support ${prefix} devices in the list of its supported platforms ` +
        `(${info.platforms.join(',')}). Extracting the package again`,
    );
    return false;
  }

  if (scope !== 'app-under-test' || !isWatchOs(driver.opts.platformName)) {
    return true;
  }

  const {bundleId: bundleIdCap, watchBundleId} = driver.opts;
  const requested = watchBundleId ?? bundleIdCap;
  if (isEmpty(requested)) {
    return true;
  }
  // The cached bundle is a standalone one, so the outer application it came from is no longer
  // known; the path forms that reference it by name still resolve.
  const candidate: WatchAppBundleCandidate = {
    bundleId: info.bundleId,
    companionAppBundleId: info.companionAppBundleId,
    fullPath: cachedPath,
    isStandalone: info.isStandalone,
    relativePath: path.basename(cachedPath),
  };
  if (isWatchAppBundleReferencedBy(candidate, requested as string, path.dirname(cachedPath), Boolean(watchBundleId))) {
    return true;
  }
  driver.log.info(
    `Ignoring the cached '${cachedPath}': it holds the '${info.bundleId}' watchOS application, ` +
      `while this session selects '${requested}'. Extracting the package again`,
  );
  return false;
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
  // `isStandalone` also settles the question: a standalone watch application carries its own
  // `1KitProvisioningComponent`, and a manifest may list the platform under a name this prefix does
  // not cover. Either way the bundle is what the session wants, so there is nothing to extract - and
  // the caller is told which bundle that is, rather than being left to the order a filesystem
  // reports the package contents in.
  if (outerAppInfo.platforms.some((platform) => platform.startsWith(prefix)) || outerAppInfo.isStandalone) {
    driver.log.debug(`'${appPath}' is already a ${prefix} application bundle`);
    return {
      kind: 'watch-app',
      candidate: {
        bundleId: outerAppInfo.bundleId,
        companionAppBundleId: outerAppInfo.companionAppBundleId,
        fullPath: appPath,
        // The bundle owns itself, so the only way of naming it is its own name.
        isStandalone: outerAppInfo.isStandalone,
        relativePath: '',
      },
    };
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

  // `appium:watchBundleId` is authoritative: an outer application that owns none of it is not the
  // owner the session is asking for. In an archive several outer applications may sit side by side,
  // so this is reported to the caller that has asked all of them rather than being fatal here.
  if (sessionCapsApply && !isEmpty(driver.opts.watchBundleId)) {
    const requested = driver.opts.watchBundleId as string;
    if (!watchAppBundles.some((candidate) => isWatchAppBundleReferencedBy(candidate, requested, appPath, true))) {
      return {kind: 'unmatched', owners: [{appPath, candidates: watchAppBundles}]};
    }
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
  return {kind: 'selected', candidate: selected};
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
  // The name of the bundle is taken from its own path: a bundle that owns itself is described by an
  // empty path relative to its owner, and its file name is then the only form left.
  const candidateName = path.posix.basename(candidate.fullPath.split(path.sep).join(path.posix.sep));
  const relativePath = candidate.relativePath.split(path.sep).join(path.posix.sep);
  return (
    reference === relativePath ||
    reference === candidateName ||
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
    if (matches.length > 1) {
      throw new Error(
        `The 'appium:watchBundleId' capability has been set to '${watchBundleId}', which matches ` +
          `multiple watchOS application bundles: ${describeCandidates(matches)}. Use the bundle ` +
          `identifier or the exact relative path to select only one of them.`,
      );
    }
    // Callers only reach this with a capability that references at least one of the candidates;
    // one that references none is reported across every owner of the package.
    return matches[0];
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
 * The folder under the system temporary folder where the disposable copies of local packages live.
 * A fixed root, rather than one random folder per session, is what lets a later session recognise
 * the copy an earlier one made of the same bundle and reuse it.
 */
const COPIED_BUNDLES_FOLDER = 'appium-xcuitest-driver-copied-bundles';

/**
 * The file next to a copied bundle recording what that copy was made of.
 */
const COPIED_BUNDLE_MARKER_FILE = 'appium-copy-source.json';

/**
 * Creates a disposable copy of the watch application bundle a session has selected.
 *
 * The copy is what the session installs: the package the user provided must never be modified, and
 * the selected bundle lives inside it. Its destination is derived from the bundle identifier and the
 * identity of the source package instead of being a fresh random folder, because the base driver
 * caches the path this returns under the key of the *provided* package and deletes whatever a
 * previous session was handed before storing the new one. With random destinations two sessions
 * using the same package each delete the other's copy - which for a local `.app` folder is *every*
 * session, since a folder has no package hash and so can never be reused by that cache. Same inputs
 * now produce the same path, so the driver sees its own path coming back and keeps it, and a copy
 * that is already complete is not copied again.
 *
 * @param driver The driver that owns the session
 * @param candidate The selected watch application bundle
 * @param sourceLink The link the session was given for the package this bundle came from
 * @returns Full path to the copied bundle
 * @remarks Two sessions selecting *different* watch applications of one package still resolve to
 * different folders, so the second one's store-then-delete sequence still removes the copy the first
 * is installing. That deletion happens inside the base driver, outside the reach of this hook; what
 * is fixed here is that it now takes two different selections to happen at all.
 */
async function copyAppBundle(
  driver: XCUITestDriver,
  candidate: WatchAppBundleCandidate,
  sourceLink: string,
): Promise<string> {
  const sourceIdentity = await toCopiedBundleIdentity(driver, sourceLink, candidate.fullPath);
  const signature = createHash('sha256').update(`${candidate.bundleId}\n${sourceIdentity}`).digest('hex');
  const copiedRoot = path.join(process.env.APPIUM_TMP_DIR || os.tmpdir(), COPIED_BUNDLES_FOLDER, signature);
  const copiedPath = path.join(copiedRoot, path.basename(candidate.fullPath));
  if (await isCopiedAppBundleCurrent(driver, copiedRoot, copiedPath, candidate.bundleId, sourceIdentity)) {
    driver.log.debug(
      `Reusing the '${candidate.bundleId}' application copy at '${copiedPath}', which was made of ` + `'${sourceLink}'`,
    );
    return copiedPath;
  }

  // Anything already at that path is a copy of something else, a hand-made folder, or a bundle left
  // by a driver whose marker this one cannot read, so it goes away before the new copy is written.
  await fs.rimraf(copiedRoot);
  // The marker is written only once the bundle copy is complete, which is what makes it the signal
  // another session may read: one that arrives mid-copy finds no marker and copies the bundle itself
  // rather than installing a half-finished one.
  //
  // `ditto` is the canonical way of copying macOS application bundles: unlike a plain recursive
  // copy it keeps symlinks and bundle metadata intact. It is a macOS-only tool, and `fs.which`
  // rejects rather than returning null when an executable is absent, hence the explicit catch.
  const dittoPath = await fs.which('ditto').catch(() => null);
  if (dittoPath) {
    await exec(dittoPath, [candidate.fullPath, copiedPath]);
  } else {
    // The driver also runs on Linux and Windows hosts, where no `ditto` exists. `verbatimSymlinks`
    // is required, not cosmetic: without it `fs.cp` rewrites each link target, measured to turn
    // `Versions/Current -> A` into an absolute path into the *source* bundle. The copy would then
    // still read the user's original package, which defeats the point of making a disposable one.
    await cp(candidate.fullPath, copiedPath, {recursive: true, verbatimSymlinks: true});
  }
  await fs.writeFile(
    path.join(copiedRoot, COPIED_BUNDLE_MARKER_FILE),
    JSON.stringify({bundleId: candidate.bundleId, sourceLink, sourceIdentity}),
    'utf8',
  );
  return copiedPath;
}

/**
 * @param driver The driver that owns the session
 * @param copiedRoot The folder expected to hold the copy and its marker
 * @param copiedPath The expected path of the copied bundle
 * @param bundleId The application the copy must be
 * @param sourceIdentity The package the copy must have been made of
 * @returns Whether `copiedPath` is that application, copied from that package
 * @remarks Anything else sitting at that path - a copy of another package, a hand-made folder, a
 * bundle left behind by a driver that used a different marker format - is replaced, not installed.
 */
async function isCopiedAppBundleCurrent(
  driver: XCUITestDriver,
  copiedRoot: string,
  copiedPath: string,
  bundleId: string,
  sourceIdentity: string,
): Promise<boolean> {
  if (!(await fs.exists(copiedPath))) {
    return false;
  }
  let marker: unknown;
  try {
    marker = JSON.parse(await fs.readFile(path.join(copiedRoot, COPIED_BUNDLE_MARKER_FILE), 'utf8'));
  } catch (e: any) {
    driver.log.debug(`'${copiedPath}' has no readable copy marker (${e.message}), so it is copied again`);
    return false;
  }
  const {bundleId: copiedBundleId, sourceIdentity: copiedSourceIdentity} = isPlainObject(marker)
    ? marker
    : {bundleId: undefined, sourceIdentity: undefined};
  if (copiedBundleId !== bundleId) {
    driver.log.debug(
      `'${copiedPath}' holds the '${String(copiedBundleId)}' application rather than ` +
        `'${bundleId}', so it is copied again`,
    );
    return false;
  }
  if (copiedSourceIdentity !== sourceIdentity) {
    driver.log.debug(`'${copiedPath}' was copied from an older version of the package, so it is copied again`);
    return false;
  }
  return true;
}

/**
 * @param driver The driver that owns the session
 * @param sourceLink The link the session was given for the package (`appium:app`, or the path a
 * download was written to)
 * @param bundlePath Full path to the bundle selected out of that package
 * @returns A fingerprint of the application the copy is about to be, cheap enough for every session
 * @remarks A rebuilt application is what has to invalidate a copy. An incremental build rewrites the
 * manifest of the bundle it built and may leave the package folder timestamp alone, while installing
 * a fresh build into the package moves the folder and not the nested manifest - so both are asked.
 * Hashing a whole watch application per session was not worth it: one rebuild moves one of these.
 */
async function toCopiedBundleIdentity(driver: XCUITestDriver, sourceLink: string, bundlePath: string): Promise<string> {
  // `appium:app` may be relative, and two sessions naming the same package differently must not end
  // up with two copies of it.
  const sourcePath = path.resolve(sourceLink);
  const [sourceStat, manifestStat] = await Promise.all([
    fs.stat(sourcePath).catch(() => null),
    fs.stat(path.join(bundlePath, 'Info.plist')).catch(() => null),
  ]);
  let sourceIdentity: string;
  if (!sourceStat) {
    // Nothing on the local file system to inspect - the link is a URL, or the package was removed
    // while this session was being created. The link is all there is to share.
    sourceIdentity = `link:${sourcePath}`;
  } else if (sourceStat.isFile()) {
    sourceIdentity = `file:${await fs.hash(sourcePath)}`;
  } else {
    sourceIdentity = `folder:${sourcePath}:${sourceStat.mtimeMs}`;
  }
  const bundleIdentity = manifestStat ? `${manifestStat.mtimeMs}+${manifestStat.size}` : 'no-manifest';
  driver.log.debug(`The '${path.basename(bundlePath)}' copy is keyed on '${sourceIdentity} + ${bundleIdentity}'`);
  return `${sourceIdentity}\n${bundleIdentity}`;
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
 * the applications between which the session has to choose, or `none` if no application in the
 * archive wanted a watch application at all - which means the archive holds one directly and needs
 * no rewriting
 * @throws If the nested watch applications cannot be reduced to exactly one
 * @remarks Every application of the archive is asked even after one of them has offered a usable
 * watch application: an archive holding `Payload/Alpha.app/Watch/Watch.app` next to
 * `Payload/Zeta.app/Watch/Watch.app` must name both rather than install whichever `findApps`
 * reported first.
 */
async function resolveWatchAppBundleFromArchive(
  driver: XCUITestDriver,
  rootDir: string,
  matchedPaths: string[],
  scope: WatchAppSelectionScope,
): Promise<ArchiveWatchAppBundleResolution> {
  const visitedAppPaths = new Set<string>();
  const owners: UnmatchedWatchAppOwner[] = [];
  const selections: UnmatchedWatchAppOwner[] = [];
  let missing: Extract<WatchAppBundleResolution, {kind: 'missing'}> | undefined;
  for (const matchedPath of matchedPaths) {
    const outerAppPath = path.join(rootDir, findOwningAppBundlePath(matchedPath));
    if (visitedAppPaths.has(outerAppPath)) {
      continue;
    }
    visitedAppPaths.add(outerAppPath);
    const resolution = await resolveWatchAppBundle(driver, outerAppPath, scope);
    switch (resolution.kind) {
      case 'selected':
        selections.push({appPath: outerAppPath, candidates: [resolution.candidate]});
        break;
      case 'watch-app':
        // The archive carries this session's application bundle as one of its own items, so there is
        // nothing to extract out of it - but it is still one of the bundles the session could be
        // given, and the archive may hold another owner further along.
        selections.push({appPath: outerAppPath, candidates: [resolution.candidate]});
        break;
      // An outer application that owns other watch applications is simply not the one the session
      // names; the archive may hold the requested bundle further along, so keep looking.
      case 'unmatched':
        owners.push(...resolution.owners);
        break;
      default:
        missing ??= resolution.kind === 'missing' ? resolution : undefined;
        break;
    }
  }
  if (selections.length > 1) {
    throw multipleWatchAppsError(driver, selections, scope === 'app-under-test');
  }
  if (selections.length === 1) {
    return {kind: 'selected', candidate: selections[0].candidates[0]};
  }
  if (!isEmpty(owners)) {
    return {kind: 'unmatched', owners};
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
        driver.log.debug(`Selecting the watchOS application at '${resolution.candidate.fullPath}'`);
        return await isolateApp(resolution.candidate.fullPath);
      }
      if (resolution.kind === 'missing' && scope === 'app-under-test') {
        // No outer application of this archive carries the watch application the session needs, so
        // the generic loop below would pick an incompatible bundle and report an architecture
        // mismatch instead of the missing watch payload.
        throw missingWatchAppBundleError(resolution.appPath, resolution.companionWatchBundleId);
      }
      if (resolution.kind === 'unmatched') {
        // Every owner of the archive has been asked; none of them holds the requested bundle. The
        // generic loop below would pick an incompatible iOS bundle and report an architecture
        // mismatch instead of naming the watch applications that are actually available.
        throw unmatchedWatchAppBundleError(driver, resolution.owners);
      }
    }
    // Reaching here for a watchOS session means `none`: the archive holds this session's application
    // bundle as one of its own items, so the bundle is installed as is.
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
