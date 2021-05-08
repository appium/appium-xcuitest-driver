import _ from 'lodash';
import path from 'path';
import { plist, fs, util } from 'appium-support';
import log from './logger.js';

const STRINGSDICT_RESOURCE = '.stringsdict';
const STRINGS_RESOURCE = '.strings';


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

  let supportedPlatforms;
  try {
    supportedPlatforms = await extractPlistEntry(app, 'CFBundleSupportedPlatforms');
  } catch (err) {
    log.debug(err.message);
    return;
  }
  log.debug(`CFBundleSupportedPlatforms: ${JSON.stringify(supportedPlatforms)}`);
  if (!_.isArray(supportedPlatforms)) {
    log.debug(`CFBundleSupportedPlatforms key does not exist in '${path.basename(app)}'`);
    return;
  }

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

export { extractBundleId, verifyApplicationPlatform, parseLocalizableStrings };
