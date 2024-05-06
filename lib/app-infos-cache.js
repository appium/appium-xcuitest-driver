import _ from 'lodash';
import path from 'path';
import {plist, fs, tempDir, zip, util} from 'appium/support';
import {LRUCache} from 'lru-cache';
import B from 'bluebird';

/** @type {LRUCache<string, import('@appium/types').StringRecord>} */
const MANIFEST_CACHE = new LRUCache({
  max: 40,
  updateAgeOnHas: true,
});
const MANIFEST_FILE_NAME = 'Info.plist';
const MAX_MANIFEST_SIZE = 1024 * 1024; // 1 MiB

export class AppInfosCache {
  /**
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
        throw new Error(`Cannot parse ${MANIFEST_FILE_NAME} of '${appPath}'. Is it a valid application bundle?`);
      }
    };

    if ((await fs.stat(appPath)).isFile()) {
      /** @type {import('@appium/types').StringRecord|undefined} */
      let manifestPayload;
      /** @type {Error|undefined} */
      let lastError;
      /** @type {import('@appium/types').StringRecord<[string, import('@appium/types').StringRecord]>} */
      const plistCandidates = {};
      try {
        await zip.readEntries(appPath, async ({entry, extractEntryTo}) => {
          if (!_.endsWith(entry.fileName, `.app/${MANIFEST_FILE_NAME}`)) {
            return true;
          }

          const hash = `${entry.crc32}`;
          if (MANIFEST_CACHE.has(hash)) {
            manifestPayload = MANIFEST_CACHE.get(hash);
            return false;
          }
          const tmpRoot = await tempDir.openDir();
          try {
            await extractEntryTo(tmpRoot);
            const plistPath = path.resolve(tmpRoot, entry.fileName);
            if (entry.uncompressedSize <= MAX_MANIFEST_SIZE && _.isPlainObject(payload)) {
              plistCandidates[hash] = [entry.fileName, await readPlist(plistPath)];
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
        throw new Error(`Cannot find ${MANIFEST_FILE_NAME} in '${appPath}'. Is it a valid application bundle?`);
      }
      if (!manifestPayload && !_.isEmpty(plistCandidates)) {
        this.log.debug(
          `Parsed ${util.pluralize('candidate plist', _.size(plistCandidates), true)}: ` +
          JSON.stringify(_.toPairs(plistCandidates).map(([, [fileName]]) => fileName))
        );
        /** @type {string?} */
        let topPlistPath = null;
        /** @type {string?} */
        let topPlistHash = null;
        // It might be that an app bundle contains multiple Info.plist files
        // We need to only consider the one that is located at the top of the hierarchy
        for (const [hash, [fileName, payload]] of _.toPairs(plistCandidates)) {
          if (!topPlistPath || fileName.length < topPlistPath.length) {
            topPlistHash = hash;
            topPlistPath = fileName;
            manifestPayload = payload;
          }
        }
        if (manifestPayload && topPlistHash && topPlistPath) {
          this.log.debug(
            `Caching the manifest '${topPlistPath}' for ${manifestPayload?.CFBundleIdentifier} app ` +
            `from the compressed source using the key '${topPlistHash}'`
          );
          MANIFEST_CACHE.set(topPlistHash, manifestPayload);
        }
      }
      if (!manifestPayload) {
        let errorMessage = `Cannot extract ${MANIFEST_FILE_NAME} from '${appPath}'. Is it a valid application bundle?`;
        if (lastError) {
          errorMessage += ` Original error: ${lastError.message}`;
        }
        throw new Error(errorMessage);
      }
      return manifestPayload;
    }

    // appPath points to a folder
    const manifestPath = path.join(appPath, MANIFEST_FILE_NAME);
    const hash = await fs.hash(manifestPath);
    if (MANIFEST_CACHE.has(hash)) {
      return /** @type {import('@appium/types').StringRecord} */ (MANIFEST_CACHE.get(hash));
    }
    const [payload, stat] = await B.all([
      readPlist(manifestPath),
      fs.stat(manifestPath),
    ]);
    if (stat.size <= MAX_MANIFEST_SIZE && _.isPlainObject(payload)) {
      this.log.debug(
        `Caching the manifest for ${payload.CFBundleIdentifier} app from a file source using the key '${hash}'`
      );
      MANIFEST_CACHE.set(hash, payload);
    }
    return payload;
  }
}
