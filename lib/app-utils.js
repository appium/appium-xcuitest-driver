import _ from 'lodash';
import path from 'path';
import {plist, fs, util, tempDir, zip, timing} from 'appium/support';
import log from './logger.js';
import os from 'node:os';
import {exec} from 'teen_process';
import B from 'bluebird';
import {spawn} from 'node:child_process';
import assert from 'node:assert';
import { isTvOs } from './utils.js';

const STRINGSDICT_RESOURCE = '.stringsdict';
const STRINGS_RESOURCE = '.strings';
export const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
export const APP_EXT = '.app';
export const IPA_EXT = '.ipa';
const ZIP_EXT = '.zip';
const SAFARI_OPTS_ALIASES_MAP = /** @type {const} */ ({
  safariAllowPopups: [
    ['WebKitJavaScriptCanOpenWindowsAutomatically', 'JavaScriptCanOpenWindowsAutomatically'],
    (x) => Number(Boolean(x)),
  ],
  safariIgnoreFraudWarning: [['WarnAboutFraudulentWebsites'], (x) => Number(!x)],
  safariOpenLinksInBackground: [['OpenLinksInBackground'], (x) => Number(Boolean(x))],
});
const MAX_ARCHIVE_SCAN_DEPTH = 1;
export const SUPPORTED_EXTENSIONS = [IPA_EXT, APP_EXT];
const MACOS_RESOURCE_FOLDER = '__MACOSX';
const SANITIZE_REPLACEMENT = '-';

/**
 * Verify whether the given application is compatible to the
 * platform where it is going to be installed and tested.
 *
 * @this {XCUITestDriver}
 * @returns {Promise<void>}
 * @throws {Error} If bundle architecture does not match the expected device architecture.
 */
export async function verifyApplicationPlatform() {
  this.log.debug('Verifying application platform');

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
  const [resFile, resUname] = await B.all([
    exec('file', [executablePath]),
    exec('uname', ['-m']),
  ]);
  const bundleExecutableInfo = _.trim(resFile.stdout);
  this.log.debug(bundleExecutableInfo);
  const arch = _.trim(resUname.stdout);
  const isAppleSilicon = os.cpus()[0].model.includes('Apple');
  // We cannot run Simulator builds compiled for arm64 on Intel machines
  // Rosetta allows only to run Intel ones on arm64
  if (
    !_.includes(bundleExecutableInfo, `executable ${arch}`) &&
    !(isAppleSilicon && _.includes(bundleExecutableInfo, 'executable x86_64'))
  ) {
    throw new Error(
      `The ${this.opts.bundleId} application does not support the ${arch} Simulator ` +
        `architecture:\n${bundleExecutableInfo}\n\n` +
        `Please rebuild your application to support the ${arch} platform.`,
    );
  }
}

/**
 *
 * @param {string} resourcePath
 * @returns {Promise<import('@appium/types').StringRecord>}
 */
async function readResource(resourcePath) {
  const data = await plist.parsePlistFile(resourcePath);
  const result = {};
  for (const [key, value] of _.toPairs(data)) {
    result[key] = _.isString(value) ? value : JSON.stringify(value);
  }
  return result;
}

/**
 * @typedef {Object} LocalizableStringsOptions
 * @property {string} [app]
 * @property {string} [language='en']
 * @property {string} [localizableStringsDir]
 * @property {string} [stringFile]
 * @property {boolean} [strictMode]
 */

/**
 * Extracts string resources from an app
 *
 * @this {XCUITestDriver}
 * @param {LocalizableStringsOptions} opts
 * @returns {Promise<import('@appium/types').StringRecord>}
 */
export async function parseLocalizableStrings(opts = {}) {
  const {app, language = 'en', localizableStringsDir, stringFile, strictMode} = opts;
  if (!app) {
    const message = `Strings extraction is not supported if 'app' capability is not set`;
    if (strictMode) {
      throw new Error(message);
    }
    this.log.info(message);
    return {};
  }

  let bundleRoot = app;
  const isArchive = (await fs.stat(app)).isFile();
  let tmpRoot;
  try {
    if (isArchive) {
      tmpRoot = await tempDir.openDir();
      this.log.info(`Extracting '${app}' into a temporary location to parse its resources`);
      await zip.extractAllTo(app, tmpRoot);
      const relativeBundleRoot = /** @type {string} */ (_.first(await findApps(tmpRoot, [APP_EXT])));
      this.log.info(`Selecting '${relativeBundleRoot}'`);
      bundleRoot = path.join(tmpRoot, relativeBundleRoot);
    }

    /** @type {string|undefined} */
    let lprojRoot;
    for (const subfolder of [`${language}.lproj`, localizableStringsDir, ''].filter(_.isString)) {
      lprojRoot = path.resolve(bundleRoot, /** @type {string} */ (subfolder));
      if (await fs.exists(lprojRoot)) {
        break;
      }
      const message = `No '${lprojRoot}' resources folder has been found`;
      if (strictMode) {
        throw new Error(message);
      }
      this.log.debug(message);
    }
    if (!lprojRoot) {
      return {};
    }

    this.log.info(`Retrieving resource strings from '${lprojRoot}'`);
    const resourcePaths = [];
    if (stringFile) {
      const dstPath = path.resolve(/** @type {string} */ (lprojRoot), stringFile);
      if (await fs.exists(dstPath)) {
        resourcePaths.push(dstPath);
      } else {
        const message = `No '${dstPath}' resource file has been found for '${app}'`;
        if (strictMode) {
          throw new Error(message);
        }
        this.log.info(message);
      }
    }

    if (_.isEmpty(resourcePaths) && (await fs.exists(lprojRoot))) {
      const resourceFiles = (await fs.readdir(lprojRoot))
        .filter((name) => _.some([STRINGS_RESOURCE, STRINGSDICT_RESOURCE], (x) => name.endsWith(x)))
        .map((name) => path.resolve(lprojRoot, name));
      resourcePaths.push(...resourceFiles);
    }
    this.log.info(`Got ${util.pluralize('resource file', resourcePaths.length, true)} in '${lprojRoot}'`);

    if (_.isEmpty(resourcePaths)) {
      return {};
    }

    const resultStrings = {};
    const toAbsolutePath = (/** @type {string} */ p) => path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    for (const resourcePath of resourcePaths) {
      if (!util.isSubPath(toAbsolutePath(resourcePath), toAbsolutePath(bundleRoot))) {
        // security precaution
        throw new Error(`'${resourcePath}' is expected to be located under '${bundleRoot}'`);
      }
      try {
        const data = await readResource(resourcePath);
        this.log.debug(`Parsed ${util.pluralize('string', _.keys(data).length, true)} from '${resourcePath}'`);
        _.merge(resultStrings, data);
      } catch (e) {
        this.log.warn(`Cannot parse '${resourcePath}' resource. Original error: ${e.message}`);
      }
    }

    this.log.info(`Retrieved ${util.pluralize('string', _.keys(resultStrings).length, true)} from '${lprojRoot}'`);
    return resultStrings;
  } finally {
    if (tmpRoot) {
      await fs.rimraf(tmpRoot);
    }
  }
}

/**
 * Check whether the given path on the file system points to the .app bundle root
 *
 * @param {string} appPath Possible .app bundle root
 * @returns {Promise<boolean>} Whether the given path points to an .app bundle
 */
async function isAppBundle(appPath) {
  return (
    _.endsWith(_.toLower(appPath), APP_EXT) &&
    (await fs.stat(appPath)).isDirectory() &&
    (await fs.exists(path.join(appPath, 'Info.plist')))
  );
}

/**
 * Check whether the given path on the file system points to the .ipa file
 *
 * @param {string} appPath Possible .ipa file
 * @returns {Promise<boolean>} Whether the given path points to an .ipa bundle
 */
async function isIpaBundle(appPath) {
  return _.endsWith(_.toLower(appPath), IPA_EXT) && (await fs.stat(appPath)).isFile();
}

/**
 * @typedef {Object} UnzipInfo
 * @property {string} rootDir
 * @property {number} archiveSize
 */

/**
 * Unzips a ZIP archive on the local file system.
 *
 * @param {string} archivePath Full path to a .zip archive
 * @returns {Promise<UnzipInfo>} temporary folder root where the archive has been extracted
 */
export async function unzipFile(archivePath) {
  const useSystemUnzipEnv = process.env.APPIUM_PREFER_SYSTEM_UNZIP;
  const useSystemUnzip =
    _.isEmpty(useSystemUnzipEnv) || !['0', 'false'].includes(_.toLower(useSystemUnzipEnv));
  const tmpRoot = await tempDir.openDir();
  try {
    await zip.extractAllTo(archivePath, tmpRoot, {useSystemUnzip});
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
 *
 * @param {import('node:stream').Readable} zipStream
 * @returns {Promise<UnzipInfo>}
 */
export async function unzipStream(zipStream) {
  const tmpRoot = await tempDir.openDir();
  const bsdtarProcess = spawn(await fs.which('bsdtar'), [
    '-x',
    '--exclude', MACOS_RESOURCE_FOLDER,
    '--exclude', `${MACOS_RESOURCE_FOLDER}/*`,
    '-',
  ], {
    cwd: tmpRoot,
  });
  let archiveSize = 0;
  bsdtarProcess.stderr.on('data', (chunk) => {
    const stderr = chunk.toString();
    if (_.trim(stderr)) {
      log.warn(stderr);
    }
  });
  zipStream.on('data', (chunk) => {
    archiveSize += _.size(chunk);
  });
  zipStream.pipe(bsdtarProcess.stdin);
  try {
    await new B((resolve, reject) => {
      zipStream.once('error', reject);
      bsdtarProcess.once('exit', (code, signal) => {
        zipStream.unpipe(bsdtarProcess.stdin);
        log.debug(`bsdtar process exited with code ${code}, signal ${signal}`);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Is it a valid ZIP archive?'));
        }
      });
      bsdtarProcess.once('error', (e) => {
        zipStream.unpipe(bsdtarProcess.stdin);
        reject(e);
      });
    });
  } catch (err) {
    bsdtarProcess.kill(9);
    await fs.rimraf(tmpRoot);
    throw new Error(`The response data cannot be unzipped: ${err.message}`);
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
 * Used to parse the file name value from response headers
 *
 * @param {import('@appium/types').HTTPHeaders} headers
 * @returns {string?}
 */
function parseFileName(headers) {
  const contentDisposition = headers['content-disposition'];
  if (!_.isString(contentDisposition)) {
    return null;
  }

  if (/^attachment/i.test(/** @type {string} */ (contentDisposition))) {
    const match = /filename="([^"]+)/i.exec(/** @type {string} */ (contentDisposition));
    if (match) {
      return fs.sanitizeName(match[1], {replacement: SANITIZE_REPLACEMENT});
    }
  }
  return null;
}

/**
 * Downloads and verifies remote applications for real devices
 *
 * @this {XCUITestDriver}
 * @param {import('node:stream').Readable} stream
 * @param {import('@appium/types').HTTPHeaders} headers
 * @returns {Promise<string>}
 */
async function downloadIpa(stream, headers) {
  const timer = new timing.Timer().start();

  const logPerformance = (/** @type {string} */ dstPath, /** @type {number} */ fileSize, /** @type {string} */ action) => {
    const secondsElapsed = timer.getDuration().asSeconds;
    this.log.info(
      `The remote file (${util.toReadableSizeString(fileSize)}) ` +
      `has been ${action} to '${dstPath}' in ${secondsElapsed.toFixed(3)}s`
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
      if (!_.isEmpty(matchedPaths)) {
        this.log.debug(
          `Found ${util.pluralize(`${IPA_EXT} applicaition`, matchedPaths.length, true)} in ` +
          `'${path.basename(rootDir)}': ${matchedPaths}`
        );
      }
      for (const matchedPath of matchedPaths) {
        try {
          await this.appInfosCache.put(matchedPath);
        } catch (e) {
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

    await new B((resolve, reject) => {
      stream.once('error', reject);
      writer.once('finish', resolve);
      writer.once('error', (e) => {
        stream.unpipe(writer);
        reject(e);
      });
    });
  } catch (err) {
    throw new Error(`Cannot fetch the remote file: ${err.message}`);
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
 * Looks for items with given extensions in the given folder
 *
 * @param {string} appPath Full path to an app bundle
 * @param {Array<string>} appExtensions List of matching item extensions
 * @returns {Promise<string[]>} List of relative paths to matched items
 */
async function findApps(appPath, appExtensions) {
  const globPattern = `**/*.+(${appExtensions.map((ext) => ext.replace(/^\./, '')).join('|')})`;
  const sortedBundleItems = (
    await fs.glob(globPattern, {
      cwd: appPath,
    })
  ).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return sortedBundleItems;
}

/**
 * Moves the application bundle to a newly created temporary folder
 *
 * @param {string} appPath Full path to the .app or .ipa bundle
 * @returns {Promise<string>} The new path to the app bundle.
 * The name of the app bundle remains the same
 */
async function isolateApp(appPath) {
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
 * Builds Safari preferences object based on the given session capabilities
 *
 * @param {import('./driver').XCUITestDriverOpts} opts
 * @return {Promise<import('@appium/types').StringRecord>}
 */
export function buildSafariPreferences(opts) {
  const safariSettings = _.cloneDeep(opts?.safariGlobalPreferences ?? {});

  for (const [name, [aliases, valueConverter]] of _.toPairs(SAFARI_OPTS_ALIASES_MAP)) {
    if (!_.has(opts, name)) {
      continue;
    }

    for (const alias of aliases) {
      safariSettings[alias] = valueConverter(opts[name]);
    }
  }
  return safariSettings;
}

/**
 * Unzip the given archive and find a matching .app bundle in it
 *
 * @this {XCUITestDriver}
 * @param {string|import('node:stream').Readable} appPathOrZipStream The path to the archive.
 * @param {number} depth [0] the current nesting depth. App bundles whose nesting level
 * is greater than 1 are not supported.
 * @returns {Promise<string>} Full path to the first matching .app bundle..
 * @throws If no matching .app bundles were found in the provided archive.
 */
async function unzipApp(appPathOrZipStream, depth = 0) {
  const errMsg = `The archive did not have any matching ${APP_EXT} or ${IPA_EXT} ` +
    `bundles. Please make sure the provided package is valid and contains at least one matching ` +
    `application bundle which is not nested.`;
  if (depth > MAX_ARCHIVE_SCAN_DEPTH) {
    throw new Error(errMsg);
  }

  const timer = new timing.Timer().start();
  /** @type {string} */
  let rootDir;
  /** @type {number} */
  let archiveSize;
  try {
    if (_.isString(appPathOrZipStream)) {
      ({rootDir, archiveSize} = await unzipFile(/** @type {string} */ (appPathOrZipStream)));
    } else {
      if (depth > 0) {
        assert.fail('Streaming unzip cannot be invoked for nested archive items');
      }
      ({rootDir, archiveSize} = await unzipStream(
        /** @type {import('node:stream').Readable} */ (appPathOrZipStream))
      );
    }
  } catch (e) {
    this.log.debug(e.stack);
    throw new Error(
      `Cannot prepare the application for testing. Original error: ${e.message}`
    );
  }
  const secondsElapsed = timer.getDuration().asSeconds;
  this.log.info(
    `The file (${util.toReadableSizeString(archiveSize)}) ` +
      `has been ${_.isString(appPathOrZipStream) ? 'extracted' : 'downloaded and extracted'} ` +
      `to '${rootDir}' in ${secondsElapsed.toFixed(3)}s`
  );
  // it does not make much sense to approximate the speed for short downloads
  if (secondsElapsed >= 1) {
    const bytesPerSec = Math.floor(archiveSize / secondsElapsed);
    this.log.debug(`Approximate decompression speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
  }

  const isCompatibleWithCurrentPlatform = async (/** @type {string} */ appPath) => {
    let platforms;
    try {
      platforms = await this.appInfosCache.extractAppPlatforms(appPath);
    } catch (e) {
      this.log.info(e.message);
      return false;
    }
    if (this.isSimulator() && !platforms.some((p) => _.includes(p, 'Simulator'))) {
      this.log.info(
        `'${appPath}' does not have Simulator devices in the list of supported platforms ` +
        `(${platforms.join(',')}). Skipping it`
      );
      return false;
    }
    if (this.isRealDevice() && !platforms.some((p) => _.includes(p, 'OS'))) {
      this.log.info(
        `'${appPath}' does not have real devices in the list of supported platforms ` +
        `(${platforms.join(',')}). Skipping it`
      );
      return false;
    }
    return true;
  };

  const matchedPaths = await findApps(rootDir, SUPPORTED_EXTENSIONS);
  if (_.isEmpty(matchedPaths)) {
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
        (await isAppBundle(fullPath) || (this.isRealDevice() && await isIpaBundle(fullPath)))
        && await isCompatibleWithCurrentPlatform(fullPath)
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

/**
 * The callback invoked by configureApp helper
 * when it is necessary to download the remote application.
 * We assume the remote file could be anythingm, but only
 * .zip and .ipa formats are supported.
 * A .zip archive can contain one or more
 *
 * @this {XCUITestDriver}
 * @param {import('@appium/types').DownloadAppOptions} opts
 * @returns {Promise<string>}
 */
export async function onDownloadApp({stream, headers}) {
  return this.isRealDevice()
    ? await downloadIpa.bind(this)(stream, headers)
    : await unzipApp.bind(this)(stream);
}

/**
 * @this {XCUITestDriver}
 * @param {import('@appium/types').PostProcessOptions} opts
 * @returns {Promise<import('@appium/types').PostProcessResult|false>}
 */
export async function onPostConfigureApp({cachedAppInfo, isUrl, appPath}) {
  // Pick the previously cached entry if its integrity has been preserved
  /** @type {import('@appium/types').CachedAppInfo|undefined} */
  const appInfo = _.isPlainObject(cachedAppInfo) ? cachedAppInfo : undefined;
  const cachedPath = appInfo ? /** @type {string} */ (appInfo.fullPath) : undefined;

  const shouldUseCachedApp = async () => {
    if (!appInfo || !cachedPath || !await fs.exists(cachedPath)) {
      return false;
    }

    const isCachedPathAFile = (await fs.stat(cachedPath)).isFile();
    if (isCachedPathAFile) {
      return await fs.hash(cachedPath) === /** @type {any} */ (appInfo.integrity)?.file;
    }
    // If the cached path is a folder then it is expected to be previously extracted from
    // an archive located under appPath whose hash is stored as `cachedAppInfo.packageHash`
    if (
      !isCachedPathAFile
      && cachedAppInfo?.packageHash
      && await fs.exists(/** @type {string} */ (appPath))
      && (await fs.stat(/** @type {string} */ (appPath))).isFile()
      && cachedAppInfo.packageHash === await fs.hash(/** @type {string} */ (appPath))
    ) {
      /** @type {number|undefined} */
      const nestedItemsCountInCache = /** @type {any} */ (appInfo.integrity)?.folder;
      if (nestedItemsCountInCache !== undefined) {
        return (await fs.glob('**/*', {cwd: cachedPath})).length >= nestedItemsCountInCache;
      }
    }

    return false;
  };

  if (await shouldUseCachedApp()) {
    this.log.info(`Using '${cachedPath}' which was cached from '${appPath}'`);
    return {appPath: /** @type {string} */ (cachedPath)};
  }

  const isLocalIpa = await isIpaBundle(/** @type {string} */(appPath));
  const isLocalApp = !isLocalIpa && await isAppBundle(/** @type {string} */(appPath));
  const isPackageReadyForInstall = isLocalApp || (this.isRealDevice() && isLocalIpa);
  if (isPackageReadyForInstall) {
    await this.appInfosCache.put(/** @type {string} */(appPath));
  }
  // Only local .app bundles (real device/Simulator)
  // and .ipa packages for real devices should not be cached
  if (!isUrl && isPackageReadyForInstall) {
    return false;
  }
  // Cache the app while unpacking the bundle if necessary
  return {
    appPath: isPackageReadyForInstall
      ? appPath
      : await unzipApp.bind(this)(/** @type {string} */(appPath))
  };
}

/**
 * @typedef {import('./driver').XCUITestDriver} XCUITestDriver
 */
