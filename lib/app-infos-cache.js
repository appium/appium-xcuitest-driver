import _ from 'lodash';
import path from 'path';
import {plist, fs, tempDir, zip} from 'appium/support';
import {LRUCache} from 'lru-cache';
import B from 'bluebird';

/** @type {LRUCache<string, import('@appium/types').StringRecord>} */
const PLIST_CACHE = new LRUCache({
  max: 40,
  updateAgeOnHas: true,
});
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
   * @param {string} propertyName
   * @returns {Promise<any>}
   */
  async extractManifestProperty (appPath, propertyName) {
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
    const readPlist = async (/** @type {string} */ plistPath) => {
      try {
        return await plist.parsePlistFile(plistPath);
      } catch (e) {
        this.log.debug(e.stack);
        throw new Error(`Cannot parse ${INFO_PLIST} of '${appPath}'. Is it a valid application bundle?`);
      }
    };

    if ((await fs.stat(appPath)).isFile()) {
      /** @type {import('@appium/types').StringRecord|undefined} */
      let manifestPayload;
      /** @type {Error|undefined} */
      let lastError;
      try {
        await zip.readEntries(appPath, async ({entry, extractEntryTo}) => {
          if (!_.endsWith(entry.fileName, `.app/${INFO_PLIST}`)) {
            return true;
          }

          const hash = `${entry.crc32}`;
          if (PLIST_CACHE.has(hash)) {
            manifestPayload = PLIST_CACHE.get(hash);
            return false;
          }
          const tmpRoot = await tempDir.openDir();
          try {
            await extractEntryTo(tmpRoot);
            const plistPath = path.resolve(tmpRoot, entry.fileName);
            manifestPayload = await readPlist(plistPath);
            if (entry.uncompressedSize <= MAX_PLIST_SIZE && _.isPlainObject(manifestPayload)) {
              this.log.debug(
                `Caching the manifest for ${manifestPayload?.CFBundleIdentifier} ` +
                `from an archived source using the key '${hash}'`
              );
              PLIST_CACHE.set(hash, manifestPayload);
            }
          } catch (e) {
            this.log.debug(e.stack);
            lastError = e;
          } finally {
            await fs.rimraf(tmpRoot);
          }
          return false;
        });
      } catch (e) {
        this.log.debug(e.stack);
        throw new Error(`Cannot find ${INFO_PLIST} in '${appPath}'. Is it a valid application bundle?`);
      }
      if (!manifestPayload) {
        let errorMessage = `Cannot extract ${INFO_PLIST} from '${appPath}'. Is it a valid application bundle?`;
        if (lastError) {
          errorMessage += ` Original error: ${lastError.message}`;
        }
        throw new Error(errorMessage);
      }
      return manifestPayload;
    }

    // appPath points to a folder
    const infoPlist = path.join(appPath, INFO_PLIST);
    const hash = await fs.hash(infoPlist);
    if (PLIST_CACHE.has(hash)) {
      return /** @type {import('@appium/types').StringRecord} */ (PLIST_CACHE.get(hash));
    }
    const [payload, stat] = await B.all([
      readPlist(infoPlist),
      fs.stat(infoPlist),
    ]);
    if (stat.size <= MAX_PLIST_SIZE && _.isPlainObject(payload)) {
      this.log.debug(
        `Caching the manifest for ${payload.CFBundleIdentifier} from a file source using the key '${hash}'`
      );
      PLIST_CACHE.set(hash, payload);
    }
    return payload;
  }
}
