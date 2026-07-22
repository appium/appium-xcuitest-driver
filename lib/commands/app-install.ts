import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';

import type {
  CachedAppInfo,
  DownloadAppOptions,
  HTTPHeaders,
  PostProcessOptions,
  PostProcessResult,
} from '@appium/types';
import {fs, util, tempDir, timing} from 'appium/support.js';
import {exec} from 'teen_process';

import {installToRealDevice} from '../device/real-device-management.js';
import {installToSimulator} from '../device/simulator-management.js';
import type {XCUITestDriver} from '../driver.js';
import {isEmpty, isPlainObject, isTvOs} from '../utils/index.js';
import {checkAutInstallationState} from './app-management.js';
import {APP_EXT, IPA_EXT, SUPPORTED_EXTENSIONS} from './constants.js';
import {findApps, unzipFile, unzipStream} from './helpers/index.js';

const ZIP_EXT = '.zip';
const SANITIZE_REPLACEMENT = '-';
const INTEL_ARCH = 'x86_64';
const MAX_ARCHIVE_SCAN_DEPTH = 1;

/**
 * Verify whether the given application is compatible to the
 * platform where it is going to be installed and tested.
 *
 * @throws If bundle architecture does not match the expected device architecture.
 */
export async function verifyApplicationPlatform(this: XCUITestDriver): Promise<void> {
  this.log.debug('Verifying application platform');

  if (!this.opts.app) {
    return;
  }

  const supportedPlatforms = await this.appInfosCache.extractAppPlatforms(this.opts.app);
  const isTvOS = isTvOs(this.opts.platformName);
  const prefix = isTvOS ? 'AppleTV' : 'iPhone';
  const suffix = this.isSimulator() ? 'Simulator' : 'OS';
  const dstPlatform = `${prefix}${suffix}`;
  if (!supportedPlatforms.includes(dstPlatform)) {
    throw new Error(
      `${
        this.isSimulator() ? 'Simulator' : 'Real device'
      } architecture is not supported by the ${this.opts.bundleId} application. ` +
        `Make sure the correct deployment target has been selected for its compilation in Xcode.`,
    );
  }
  if (this.isRealDevice()) {
    return;
  }

  const executablePath = path.resolve(this.opts.app, await this.appInfosCache.extractExecutableName(this.opts.app));
  const [resFile, resUname] = await Promise.all([exec('lipo', ['-info', executablePath]), exec('uname', ['-m'])]);
  const bundleExecutableInfo = resFile.stdout.trim();
  this.log.debug(bundleExecutableInfo);
  const processArch = resUname.stdout.trim();
  this.log.debug(`Current process architecture: ${processArch}`);
  const isAppleSiliconCpu = isAppleSilicon();
  this.log.debug(`Is Apple Silicon CPU: ${isAppleSiliconCpu}`);
  if (isAppleSiliconCpu && processArch === INTEL_ARCH) {
    this.log.warn(
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
    `The ${this.opts.bundleId} application does not support the ${processArch} Simulator ` +
      `architecture:\n${bundleExecutableInfo}\n\n${advice}`,
  );
}

/**
 * Installs the app under test (and any `otherApps`) onto the device, if needed.
 */
export async function installAUT(driver: XCUITestDriver): Promise<void> {
  // install any other apps
  if (driver.opts.otherApps) {
    await driver.installOtherApps(driver.opts.otherApps);
  }

  if (driver.isSafari() || !driver.opts.app) {
    return;
  }

  await verifyApplicationPlatform.bind(driver)();

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
  return this.isRealDevice()
    ? await downloadIpa.bind(this)(opts.stream, opts.headers)
    : await unzipApp.bind(this)(opts.stream);
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
    appPath: isPackageReadyForInstall ? opts.appPath : await unzipApp.bind(this)(opts.appPath),
  };
}

// Private functions
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
async function downloadIpa(this: XCUITestDriver, stream: Readable, headers: HTTPHeaders): Promise<string> {
  const timer = new timing.Timer().start();

  const logPerformance = (dstPath: string, fileSize: number, action: string) => {
    const secondsElapsed = timer.getDuration().asSeconds;
    this.log.info(
      `The remote file (${util.toReadableSizeString(fileSize)}) ` +
        `has been ${action} to '${dstPath}' in ${secondsElapsed.toFixed(3)}s`,
    );
    if (secondsElapsed >= 1) {
      const bytesPerSec = Math.floor(fileSize / secondsElapsed);
      this.log.debug(`Approximate speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
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
        this.log.debug(
          `Found ${util.pluralize(`${IPA_EXT} application`, matchedPaths.length, true)} in ` +
            `'${path.basename(rootDir)}': ${matchedPaths}`,
        );
      }
      for (const matchedPath of matchedPaths) {
        try {
          await this.appInfosCache.put(matchedPath);
        } catch (e: any) {
          this.log.info(e.message);
          continue;
        }
        this.log.debug(`Selecting the application at '${matchedPath}'`);
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
    await this.appInfosCache.put(ipaPath);
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
  this: XCUITestDriver,
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
    this.log.debug(e.stack);
    throw new Error(`Cannot prepare the application for testing. Original error: ${e.message}`, {
      cause: e,
    });
  }
  const secondsElapsed = timer.getDuration().asSeconds;
  this.log.info(
    `The file (${util.toReadableSizeString(archiveSize)}) ` +
      `has been ${typeof appPathOrZipStream === 'string' ? 'extracted' : 'downloaded and extracted'} ` +
      `to '${rootDir}' in ${secondsElapsed.toFixed(3)}s`,
  );
  // it does not make much sense to approximate the speed for short downloads
  if (secondsElapsed >= 1) {
    const bytesPerSec = Math.floor(archiveSize / secondsElapsed);
    this.log.debug(`Approximate decompression speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
  }

  const isCompatibleWithCurrentPlatform = async (appPath: string) => {
    let platforms: string[];
    try {
      platforms = await this.appInfosCache.extractAppPlatforms(appPath);
    } catch (e: any) {
      this.log.info(e.message);
      return false;
    }
    if (this.isSimulator() && !platforms.some((p) => p.includes('Simulator'))) {
      this.log.info(
        `'${appPath}' does not have Simulator devices in the list of supported platforms ` +
          `(${platforms.join(',')}). Skipping it`,
      );
      return false;
    }
    if (this.isRealDevice() && !platforms.some((p) => p.includes('OS'))) {
      this.log.info(
        `'${appPath}' does not have real devices in the list of supported platforms ` +
          `(${platforms.join(',')}). Skipping it`,
      );
      return false;
    }
    return true;
  };

  const matchedPaths = await findApps(rootDir, SUPPORTED_EXTENSIONS);
  if (isEmpty(matchedPaths)) {
    this.log.debug(`'${path.basename(rootDir)}' has no bundles`);
  } else {
    this.log.debug(
      `Found ${util.pluralize('bundle', matchedPaths.length, true)} in ` +
        `'${path.basename(rootDir)}': ${matchedPaths}`,
    );
  }
  try {
    for (const matchedPath of matchedPaths) {
      const fullPath = path.join(rootDir, matchedPath);
      if (
        ((await isAppBundle(fullPath)) || (this.isRealDevice() && (await isIpaBundle(fullPath)))) &&
        (await isCompatibleWithCurrentPlatform(fullPath))
      ) {
        this.log.debug(`Selecting the application at '${matchedPath}'`);
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
