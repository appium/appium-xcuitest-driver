import assert from 'node:assert';
import {spawn} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';

import type {
  CachedAppInfo,
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
import {isEmpty, isPlainObject, isTvOs} from '../../utils/index.js';
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
      driver.log.info('noReset is requested. The app will not be be (re)installed');
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
      : await (driver.device as Simulator).simctl.appInfo(bundleId)
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
 */
export async function onDownloadApp(this: XCUITestDriver, opts: DownloadAppOptions): Promise<string> {
  return this.isRealDevice() ? await downloadIpa(this, opts.stream, opts.headers) : await unzipApp(this, opts.stream);
}

/** Post-processes configured apps and reuses a valid cache entry when possible. */
export async function onPostConfigureApp(
  this: XCUITestDriver,
  opts: PostProcessOptions,
): Promise<PostProcessResult | false> {
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
      return false;
    }
    this.log.info(`Using '${cachedPath}' which was cached from '${opts.appPath || 'unknown'}'`);
    return {appPath: cachedPath};
  }

  if (!opts.appPath) {
    return false;
  }

  const isLocalIpa = await isIpaBundle(opts.appPath);
  const isLocalApp = !isLocalIpa && (await isAppBundle(opts.appPath));
  const isPackageReadyForInstall = isLocalApp || (this.isRealDevice() && isLocalIpa);
  if (isPackageReadyForInstall) {
    await this.appInfosCache.put(opts.appPath);
  }
  // Only local .app bundles (real device/Simulator)
  // and .ipa packages for real devices should not be cached
  if (!opts.isUrl && isPackageReadyForInstall) {
    return false;
  }
  // Cache the app while unpacking the bundle if necessary
  return {
    appPath: isPackageReadyForInstall ? opts.appPath : await unzipApp(this, opts.appPath),
  };
}

// Private functions
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
  const isTvOS = isTvOs(driver.opts.platformName);
  const prefix = isTvOS ? 'AppleTV' : 'iPhone';
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
    appsList.map((app) =>
      driver.helpers.configureApp(app, {
        onPostProcess: onPostConfigureApp.bind(driver),
        onDownload: onDownloadApp.bind(driver),
        supportedExtensions: SUPPORTED_EXTENSIONS,
      } as any),
    ),
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
        try {
          await driver.appInfosCache.put(matchedPath);
        } catch (e: any) {
          driver.log.info(e.message);
          continue;
        }
        driver.log.debug(`Selecting the application at '${matchedPath}'`);
        const isolatedPath = path.join(await tempDir.openDir(), path.basename(matchedPath));
        await fs.mv(matchedPath, isolatedPath);
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
 * Unzip the given archive and find a matching .app bundle in it
 *
 * @param appPathOrZipStream The path to the archive.
 * @param depth [0] the current nesting depth. App bundles whose nesting level
 * is greater than 1 are not supported.
 * @returns Full path to the first matching .app bundle..
 * @throws If no matching .app bundles were found in the provided archive.
 */
async function unzipApp(
  driver: XCUITestDriver,
  appPathOrZipStream: string | Readable,
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
