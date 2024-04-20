import _ from 'lodash';
import path from 'path';
import {plist, fs, util, tempDir, zip, timing} from 'appium/support';
import log from './logger.js';
import {LRUCache} from 'lru-cache';
import os from 'node:os';
import {exec} from 'teen_process';
import B from 'bluebird';
import {spawn} from 'node:child_process';
import assert from 'node:assert';

const STRINGSDICT_RESOURCE = '.stringsdict';
const STRINGS_RESOURCE = '.strings';
export const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
export const APP_EXT = '.app';
export const IPA_EXT = '.ipa';
/** @type {LRUCache<string, import('@appium/types').StringRecord>} */
const PLIST_CACHE = new LRUCache({max: 20});
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


/**
 * Retrieves the value of the given entry name from the application's Info.plist.
 *
 * @this {Object} Optinal instance used for caching. Ususally the driver instance.
 * @param {string} app Full path to the app bundle root.
 * @param {string} entryName Key name in the plist.
 * @returns {Promise<any | undefined>} Either the extracted value or undefined if no such key has been found in the plist.
 * @throws {Error} If the application's Info.plist cannot be parsed.
 */
async function extractPlistEntry(app, entryName) {
  const plistPath = path.resolve(app, 'Info.plist');

  const parseFile = async () => {
    try {
      return await plist.parsePlistFile(plistPath);
    } catch (err) {
      throw new Error(`Could not extract Info.plist from '${path.basename(app)}': ${err.message}`);
    }
  };

  let plistObj = PLIST_CACHE.get(app);
  if (!plistObj) {
    plistObj = await parseFile();
    PLIST_CACHE.set(app, plistObj);
  }
  return /** @type {import('@appium/types').StringRecord} */ (plistObj)[entryName];
}

/**
 *
 * @param {string} app
 * @returns {Promise<string>}
 */
export async function extractBundleId(app) {
  const bundleId = await extractPlistEntry(app, 'CFBundleIdentifier');
  log.debug(`Getting bundle ID from app '${app}': '${bundleId}'`);
  return bundleId;
}

/**
 *
 * @param {string} app
 * @returns {Promise<string>}
 */
export async function extractBundleVersion(app) {
  return await extractPlistEntry(app, 'CFBundleVersion');
}

/**
 *
 * @param {string} app
 * @returns {Promise<string>}
 */
async function extractExecutableName(app) {
  return await extractPlistEntry(app, 'CFBundleExecutable');
}

/**
 *
 * @param {string} app
 * @returns {Promise<string[]>}
 */
export async function fetchSupportedAppPlatforms(app) {
  try {
    const result = await extractPlistEntry(app, 'CFBundleSupportedPlatforms');
    if (!_.isArray(result)) {
      log.warn(`${path.basename(app)}': CFBundleSupportedPlatforms is not a valid list`);
      return [];
    }
    return result;
  } catch (err) {
    log.warn(
      `Cannot extract the list of supported platforms from '${path.basename(app)}': ${err.message}`,
    );
    return [];
  }
}

/**
 * @typedef {Object} PlatformOpts
 *
 * @property {boolean} isSimulator - Whether the destination platform is a Simulator
 * @property {boolean} isTvOS - Whether the destination platform is a Simulator
 */

/**
 * Verify whether the given application is compatible to the
 * platform where it is going to be installed and tested.
 *
 * @param {string} app - The actual path to the application bundle
 * @param {PlatformOpts} expectedPlatform
 * @throws {Error} If bundle architecture does not match the expected device architecture.
 */
export async function verifyApplicationPlatform(app, expectedPlatform) {
  log.debug('Verifying application platform');

  const supportedPlatforms = await fetchSupportedAppPlatforms(app);
  log.debug(`CFBundleSupportedPlatforms: ${JSON.stringify(supportedPlatforms)}`);

  const {isSimulator, isTvOS} = expectedPlatform;
  const prefix = isTvOS ? 'AppleTV' : 'iPhone';
  const suffix = isSimulator ? 'Simulator' : 'OS';
  const dstPlatform = `${prefix}${suffix}`;
  const appFileName = path.basename(app);
  if (!supportedPlatforms.includes(dstPlatform)) {
    throw new Error(
      `${
        isSimulator ? 'Simulator' : 'Real device'
      } architecture is not supported by the '${appFileName}' application. ` +
        `Make sure the correct deployment target has been selected for its compilation in Xcode.`,
    );
  }
  if (isSimulator) {
    const executablePath = path.resolve(app, await extractExecutableName(app));
    const [resFile, resUname] = await B.all([
      exec('file', [executablePath]),
      exec('uname', ['-m']),
    ]);
    const bundleExecutableInfo = _.trim(resFile.stdout);
    log.debug(bundleExecutableInfo);
    const arch = _.trim(resUname.stdout);
    const isAppleSilicon = os.cpus()[0].model.includes('Apple');
    // We cannot run Simulator builds compiled for arm64 on Intel machines
    // Rosetta allows only to run Intel ones on arm64
    if (
      !_.includes(bundleExecutableInfo, `executable ${arch}`) &&
      !(isAppleSilicon && _.includes(bundleExecutableInfo, 'executable x86_64'))
    ) {
      const bundleId = await extractBundleId(app);
      throw new Error(
        `The ${bundleId} application does not support the ${arch} Simulator ` +
          `architecture:\n${bundleExecutableInfo}\n\n` +
          `Please rebuild your application to support the ${arch} platform.`,
      );
    }
  }
}

async function readResource(resourcePath) {
  const data = await plist.parsePlistFile(resourcePath);
  const result = {};
  for (const [key, value] of _.toPairs(data)) {
    result[key] = _.isString(value) ? value : JSON.stringify(value);
  }
  return result;
}

export async function parseLocalizableStrings(opts) {
  const {app, language = 'en', localizableStringsDir, stringFile, strictMode} = opts;

  if (!app) {
    const message = `Strings extraction is not supported if 'app' capability is not set`;
    if (strictMode) {
      throw new Error(message);
    }
    log.info(message);
    return {};
  }

  let lprojRoot;
  for (const subfolder of [`${language}.lproj`, localizableStringsDir, '']) {
    lprojRoot = path.resolve(app, subfolder);
    if (await fs.exists(lprojRoot)) {
      break;
    }
    const message = `No '${lprojRoot}' resources folder has been found`;
    if (strictMode) {
      throw new Error(message);
    }
    log.debug(message);
  }
  log.info(`Will extract resource strings from '${lprojRoot}'`);

  const resourcePaths = [];
  if (stringFile) {
    const dstPath = path.resolve(String(lprojRoot), stringFile);
    if (await fs.exists(dstPath)) {
      resourcePaths.push(dstPath);
    } else {
      const message = `No '${dstPath}' resource file has been found for '${app}'`;
      if (strictMode) {
        throw new Error(message);
      }
      log.info(message);
      log.info(`Getting all the available strings from '${lprojRoot}'`);
    }
  }

  if (_.isEmpty(resourcePaths) && (await fs.exists(String(lprojRoot)))) {
    const resourceFiles = (await fs.readdir(String(lprojRoot)))
      .filter((name) => _.some([STRINGS_RESOURCE, STRINGSDICT_RESOURCE], (x) => name.endsWith(x)))
      .map((name) => path.resolve(lprojRoot, name));
    resourcePaths.push(...resourceFiles);
  }
  log.info(`Got ${resourcePaths.length} resource file(s) in '${lprojRoot}'`);

  if (_.isEmpty(resourcePaths)) {
    return {};
  }

  const resultStrings = {};
  const toAbsolutePath = function (p) {
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  };
  for (const resourcePath of resourcePaths) {
    if (!util.isSubPath(toAbsolutePath(resourcePath), toAbsolutePath(app))) {
      // security precaution
      throw new Error(`'${resourcePath}' is expected to be located under '${app}'`);
    }
    try {
      const data = await readResource(resourcePath);
      log.debug(`Parsed ${_.keys(data).length} string(s) from '${resourcePath}'`);
      _.merge(resultStrings, data);
    } catch (e) {
      log.warn(`Cannot parse '${resourcePath}' resource. Original error: ${e.message}`);
    }
  }

  log.info(`Got ${_.keys(resultStrings).length} string(s) from '${lprojRoot}'`);
  return resultStrings;
}

/**
 * Check whether the given path on the file system points to the .app bundle root
 *
 * @param {string} appPath Possible .app bundle root
 * @returns {Promise<boolean>} Whether the given path points to an .app bundle
 */
export async function isAppBundle(appPath) {
  return (
    _.endsWith(_.toLower(appPath), APP_EXT) &&
    (await fs.stat(appPath)).isDirectory() &&
    (await fs.exists(path.join(appPath, 'Info.plist')))
  );
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
          reject(new Error('The response data cannot be unzipped. Is it a valid ZIP archive?'));
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
 * @param {string} appRoot Full path to the .app bundle
 * @returns {Promise<string>} The new path to the app bundle.
 * The name of the app bundle remains though
 */
export async function isolateAppBundle(appRoot) {
  const tmpRoot = await tempDir.openDir();
  const dstRoot = path.join(tmpRoot, path.basename(appRoot));
  await fs.mv(appRoot, dstRoot, {mkdirp: true});
  return dstRoot;
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
 * @this {import('./driver').XCUITestDriver}
 * @param {string|import('node:stream').Readable} appPathOrZipStream The path to the archive.
 * @param {number} depth [0] the current nesting depth. App bundles whose nesting level
 * is greater than 1 are not supported.
 * @returns {Promise<string>} Full path to the first matching .app bundle..
 * @throws If no matching .app bundles were found in the provided archive.
 */
async function unzipApp(appPathOrZipStream, depth = 0) {
  const errMsg = `The archive '${this.opts.app}' did not have any matching ${APP_EXT} or ${IPA_EXT} ` +
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
      ({rootDir, archiveSize} = await unzipFile(appPathOrZipStream));
    } else {
      if (depth > 0) {
        assert.fail('Streaming unzip cannot be invoked for nested archive items');
      }
      ({rootDir, archiveSize} = await unzipStream(appPathOrZipStream));
    }
  } catch (e) {
    this.log.debug(e.stack);
    throw new Error(
      `Cannot prepare the application at '${this.opts.app}' for testing. Original error: ${e.message}`
    );
  }
  const secondsElapsed = timer.getDuration().asSeconds;
  this.log.info(
    `The app '${this.opts.app}' (${util.toReadableSizeString(archiveSize)}) ` +
      `has been ${_.isString(appPathOrZipStream) ? 'extracted' : 'downloaded and extracted'} ` +
      `to '${rootDir}' in ${secondsElapsed.toFixed(3)}s`
  );
  // it does not make much sense to approximate the speed for short downloads
  if (secondsElapsed >= 1) {
    const bytesPerSec = Math.floor(archiveSize / secondsElapsed);
    this.log.debug(`Approximate decompression speed: ${util.toReadableSizeString(bytesPerSec)}/s`);
  }

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
      if (await isAppBundle(fullPath)) {
        const supportedPlatforms = await fetchSupportedAppPlatforms(fullPath);
        if (this.isSimulator() && !supportedPlatforms.some((p) => _.includes(p, 'Simulator'))) {
          this.log.info(
            `'${matchedPath}' does not have Simulator devices in the list of supported platforms ` +
              `(${supportedPlatforms.join(',')}). Skipping it`,
          );
          continue;
        }
        if (this.isRealDevice() && !supportedPlatforms.some((p) => _.includes(p, 'OS'))) {
          this.log.info(
            `'${matchedPath}' does not have real devices in the list of supported platforms ` +
              `(${supportedPlatforms.join(',')}). Skipping it`,
          );
          continue;
        }
        this.log.info(
          `'${matchedPath}' is the resulting application bundle selected from '${rootDir}'`,
        );
        return await isolateAppBundle(fullPath);
      } else if (_.endsWith(_.toLower(fullPath), IPA_EXT) && (await fs.stat(fullPath)).isFile()) {
        try {
          return await unzipApp.bind(this)(fullPath, depth + 1);
        } catch (e) {
          this.log.warn(`Skipping processing of '${matchedPath}': ${e.message}`);
        }
      }
    }
  } finally {
    await fs.rimraf(rootDir);
  }
  throw new Error(errMsg);
}

/**
 * @this {import('./driver').XCUITestDriver}
 * @param {import('@appium/types').DownloadAppOptions} opts
 * @returns {Promise<string>}
 */
export async function onDownloadApp({stream}) {
  return await unzipApp.bind(this)(stream);
}

/**
 * @this {import('./driver').XCUITestDriver}
 * @param {import('@appium/types').PostProcessOptions} opts
 * @returns {Promise<import('@appium/types').PostProcessResult|false>}
 */
export async function onPostConfigureApp({cachedAppInfo, isUrl, appPath}) {
  // Pick the previously cached entry if its integrity has been preserved
  /** @type {import('@appium/types').CachedAppInfo|undefined} */
  const appInfo = _.isPlainObject(cachedAppInfo) ? cachedAppInfo : undefined;
  const cachedPath = appInfo ? /** @type {string} */ (appInfo.fullPath) : undefined;
  if (
    // If cache is present
    appInfo && cachedPath
    // And if the path exists
    && await fs.exists(cachedPath)
    // And if hash matches to the cached one if this is a file
    // Or count of files >= of the cached one if this is a folder
    && (
      ((await fs.stat(cachedPath)).isFile()
        && await fs.hash(cachedPath) === /** @type {any} */ (appInfo.integrity)?.file)
      || (await fs.glob('**/*', {cwd: cachedPath})).length >= /** @type {any} */ (
        appInfo.integrity
      )?.folder
    )
  ) {
    this.log.info(`Using '${cachedPath}' which was cached from '${appPath}'`);
    return {appPath: cachedPath};
  }

  const isBundleAlreadyUnpacked = await isAppBundle(/** @type {string} */(appPath));
  // Only local .app bundles that are available in-place should not be cached
  if (!isUrl && isBundleAlreadyUnpacked) {
    return false;
  }
  // Cache the app while unpacking the bundle if necessary
  return {
    appPath: isBundleAlreadyUnpacked ? appPath : await unzipApp.bind(this)(/** @type {string} */(appPath))
  };
}
