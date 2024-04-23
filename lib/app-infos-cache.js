import path from 'path';
import {plist, fs, tempDir, zip, node} from 'appium/support';
import {LRUCache} from 'lru-cache';
import {CRC32Stream} from 'crc32-stream';
import B from 'bluebird';

/** @type {LRUCache<string, import('@appium/types').StringRecord>} */
const PLIST_CACHE = new LRUCache({max: 20});
const INFO_PLIST = 'Info.plist';
const MAX_PLIST_SIZE = 1024 * 1024; // 1 MiB

export class AppInfosCache {
  /**
   *
   * @param {import('@appium/types').AppiumLogger} log
   */
  constructor (log) {
    this.log = log;
  }

  /**
   *
   * @param {string} appPath
   * @returns {Promise<boolean>}
   */
  async has (appPath) {
    const [, appHash] = await calculateAppHash(appPath);
    return PLIST_CACHE.has(appHash);
  }

  /**
   *
   * @param {string} appPath
   * @param {string} propertyName
   * @returns {Promise<any>}
   */
  async extractManifestProperty(appPath, propertyName) {
    const result = (await this.put(appPath))[propertyName];
    this.log.debug(`${propertyName}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   *
   * @param {string} appPath
   * @returns {Promise<string>}
   */
  async extractBundleId (appPath) {
    return await this.extractManifestProperty(appPath, 'CFBundleIdentifier');
  }

  /**
   *
   * @param {string} appPath
   * @returns {Promise<string>}
   */
  async extractBundleVersion (appPath) {
    return await this.extractManifestProperty(appPath, 'CFBundleVersion');
  }

  /**
   *
   * @param {string} appPath
   * @returns {Promise<string[]>}
   */
  async extractAppPlatforms (appPath) {
    const result = await this.extractManifestProperty(appPath, 'CFBundleSupportedPlatforms');
    if (!Array.isArray(result)) {
      throw new Error(`${path.basename(appPath)}': CFBundleSupportedPlatforms is not a valid list`);
    }
    return result;
  }

  /**
   *
   * @param {string} appPath
   * @returns {Promise<string>}
   */
  async extractExecutableName (appPath) {
    return await this.extractManifestProperty(appPath, 'CFBundleExecutable');
  }

  /**
   *
   * @param {string} appPath Full path to the .ipa or .app bundle
   * @returns {Promise<import('@appium/types').StringRecord>} The payload of the manifest plist
   * @throws {Error} If the given app is not a valid bundle
   */
  async put (appPath) {
    const [isFile, appHash] = await calculateAppHash(appPath);

    if (PLIST_CACHE.has(appHash)) {
      return /** @type {import('@appium/types').StringRecord} */ (PLIST_CACHE.get(appHash));
    }

    const storeToCache = async (/** @type {string} */ plistPath) => {
      let plistContent;
      try {
        plistContent = await plist.parsePlist(plistPath);
      } catch (e) {
        this.log.debug(e.stack);
        throw new Error(`Cannot parse ${INFO_PLIST} of '${appPath}'. Is it a valid application bundle?`);
      }
      // paranoid mode on
      if (node.getObjectSize(plistContent) <= MAX_PLIST_SIZE) {
        PLIST_CACHE.set(appHash, plistContent);
      }
      return plistContent;
    };

    if (!isFile) {
      return await storeToCache(path.join(appPath, INFO_PLIST));
    }
    let didExtractPlist = false;
    const tmpRoot = await tempDir.openDir();
    try {
      try {
        await zip.readEntries(appPath, async ({entry, extractEntryTo}) => {
          if (entry.fileName === INFO_PLIST) {
            await extractEntryTo(tmpRoot);
            didExtractPlist = true;
            return false;
          }
          return true;
        });
      } catch (e) {
        this.log.debug(e.stack);
        throw new Error(`Cannot find ${INFO_PLIST} in '${appPath}'. Is it a valid application bundle?`);
      }
      if (!didExtractPlist) {
        throw new Error(`Cannot extract ${INFO_PLIST} from '${appPath}'. Is it a valid application bundle?`);
      }
      return await storeToCache(path.join(tmpRoot, INFO_PLIST));
    } finally {
      await fs.rimraf(tmpRoot);
    }
  }
}

/**
 * Calculates the hash for the given iOS app
 *
 * @param {string} appPath Either a path to .ipa file
 * or a path to the root of the .app folder
 * @returns {Promise<[boolean, string]>} Whether the bundle is a single .ipa file
 * and a unique application hash
 */
export async function calculateAppHash(appPath) {
  if ((await fs.stat(appPath)).isFile()) {
    // TODO: maybe we could read crc32 directly from a zip?
    return [true, await calculateCrc32(appPath)];
  }
  const infoPlist = path.join(appPath, INFO_PLIST);
  if (!await fs.exists(infoPlist)) {
    throw new Error(`Cannot find ${INFO_PLIST} of '${appPath}'. Is it a valid application bundle?`);
  }
  return [false, await calculateCrc32(infoPlist)];
}

/**
 * Calculates Adler32 hash of a file
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function calculateCrc32(filePath) {
  const source = fs.createReadStream(filePath);
  const checksum = new CRC32Stream();
  return await new B((resolve, reject) => {
    source.once('error', reject);
    checksum.once('end', (/** @type {Error?} */ err) => err ? reject(err) : resolve(checksum.hex()));
    source.pipe(checksum);
  });
}
