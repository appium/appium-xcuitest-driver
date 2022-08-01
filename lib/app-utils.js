import _ from 'lodash';
import path from 'path';
import { plist, fs, util, tempDir, zip } from 'appium/support';
import log from './logger.js';

const STRINGSDICT_RESOURCE = '.stringsdict';
const STRINGS_RESOURCE = '.strings';
const SAFARI_BUNDLE_ID = 'com.apple.mobilesafari';
const APP_EXT = '.app';
const IPA_EXT = '.ipa';

async function extractPlistEntry (app, entryName) {
  const plistPath = path.resolve(app, 'Info.plist');
  try {
    return (await plist.parsePlistFile(plistPath))[entryName];
  } catch (err) {
    throw new Error(`Could not extract Info.plist from '${path.basename(app)}': ${err.message}`);
  }
}

async function extractBundleId (app) {
  const bundleId = await extractPlistEntry(app, 'CFBundleIdentifier');
  log.debug(`Getting bundle ID from app '${app}': '${bundleId}'`);
  return bundleId;
}

async function fetchSupportedAppPlatforms (app) {
  try {
    const result = await extractPlistEntry(app, 'CFBundleSupportedPlatforms');
    if (!_.isArray(result)) {
      log.warn(`${path.basename(app)}': CFBundleSupportedPlatforms is not a valid list`);
      return [];
    }
    return result;
  } catch (err) {
    log.warn(
      `Cannot extract the list of supported platforms from '${path.basename(app)}': ${err.message}`
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
async function verifyApplicationPlatform (app, expectedPlatform) {
  log.debug('Verifying application platform');

  const supportedPlatforms = await fetchSupportedAppPlatforms(app);
  log.debug(`CFBundleSupportedPlatforms: ${JSON.stringify(supportedPlatforms)}`);

  const {
    isSimulator,
    isTvOS,
  } = expectedPlatform;
  const prefix = isTvOS ? 'AppleTV' : 'iPhone';
  const suffix = isSimulator ? 'Simulator' : 'OS';
  const dstPlatform = `${prefix}${suffix}`;
  if (!supportedPlatforms.includes(dstPlatform)) {
    throw new Error(`${isSimulator ? 'Simulator' : 'Real device'} architecture is unsupported by the '${app}' application. ` +
      `Make sure the correct deployment target has been selected for its compilation in Xcode.`);
  }
}

async function readResource (resourcePath) {
  const data = await plist.parsePlistFile(resourcePath);
  const result = {};
  for (const [key, value] of _.toPairs(data)) {
    result[key] = _.isString(value) ? value : JSON.stringify(value);
  }
  return result;
}

async function parseLocalizableStrings (opts) {
  const {
    app,
    language = 'en',
    localizableStringsDir,
    stringFile,
    strictMode,
  } = opts;

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
    const dstPath = path.resolve(lprojRoot, stringFile);
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

  if (_.isEmpty(resourcePaths) && await fs.exists(lprojRoot)) {
    const resourceFiles = (await fs.readdir(lprojRoot))
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
 * @returns {boolean} Whether the given path points to an .app bundle
 */
async function isAppBundle (appPath) {
  return _.endsWith(_.toLower(appPath), APP_EXT)
    && (await fs.stat(appPath)).isDirectory()
    && await fs.exists(path.join(appPath, 'Info.plist'));
}

/**
 * Extract the given archive and looks for items with given extensions in it
 *
 * @param {string} archivePath Full path to a .zip archive
 * @param {Array<string>} appExtensions List of matching item extensions
 * @returns {[string, Array<String>]} Tuple, where the first element points to
 * a temporary folder root where the archive has been extracted and the second item
 * contains a list of relative paths to matched items
 */
async function findApps (archivePath, appExtensions) {
  const useSystemUnzipEnv = process.env.APPIUM_PREFER_SYSTEM_UNZIP;
  const useSystemUnzip = _.isEmpty(useSystemUnzipEnv)
    || !['0', 'false'].includes(_.toLower(useSystemUnzipEnv));
  const tmpRoot = await tempDir.openDir();
  await zip.extractAllTo(archivePath, tmpRoot, {useSystemUnzip});
  const globPattern = `**/*.+(${appExtensions.map((ext) => ext.replace(/^\./, '')).join('|')})`;
  const sortedBundleItems = (await fs.glob(globPattern, {
    cwd: tmpRoot,
    strict: false,
  })).sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return [tmpRoot, sortedBundleItems];
}

/**
 * Moves the application bundle to a newly created temporary folder
 *
 * @param {string} appRoot Full path to the .app bundle
 * @returns {string} The new path to the app bundle.
 * The name of the app bundle remains though
 */
async function isolateAppBundle (appRoot) {
  const tmpRoot = await tempDir.openDir();
  const dstRoot = path.join(tmpRoot, path.basename(appRoot));
  await fs.mv(appRoot, dstRoot, {mkdirp: true});
  return dstRoot;
}

export {
  extractBundleId, verifyApplicationPlatform, parseLocalizableStrings,
  SAFARI_BUNDLE_ID, fetchSupportedAppPlatforms, APP_EXT, IPA_EXT,
  isAppBundle, findApps, isolateAppBundle,
};
