import _ from 'lodash';
import path from 'path';
import {plist, fs, tempDir, zip} from 'appium/support';
import {LRUCache} from 'lru-cache';
import B from 'bluebird';

/** @type {LRUCache<string, import('@appium/types').StringRecord>} */
const MANIFEST_CACHE = new LRUCache({
  max: 40,
  updateAgeOnHas: true,
});
const MANIFEST_FILE_NAME = 'Info.plist';
const IPA_ROOT_PLIST_PATH_PATTERN = new RegExp(
  `^Payload/[^/]+\\.app/${_.escapeRegExp(MANIFEST_FILE_NAME)}$`
);
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
   * @param {string} bundlePath Full path to the .ipa or .app bundle
   * @param {string} propertyName
   * @returns {Promise<any>}
   */
  async extractManifestProperty (bundlePath, propertyName) {
    const result = (await this.put(bundlePath))[propertyName];
    this.log.debug(`${propertyName}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   *
   * @param {string} bundlePath Full path to the .ipa or .app bundle
   * @returns {Promise<string>}
   */
  async extractBundleId (bundlePath) {
    return await this.extractManifestProperty(bundlePath, 'CFBundleIdentifier');
  }

  /**
   *
   * @param {string} bundlePath Full path to the .ipa or .app bundle
   * @returns {Promise<string>}
   */
  async extractBundleVersion (bundlePath) {
    return await this.extractManifestProperty(bundlePath, 'CFBundleVersion');
  }

  /**
   *
   * @param {string} bundlePath Full path to the .ipa or .app bundle
   * @returns {Promise<string[]>}
   */
  async extractAppPlatforms (bundlePath) {
    const result = await this.extractManifestProperty(bundlePath, 'CFBundleSupportedPlatforms');
    if (!Array.isArray(result)) {
      throw new Error(`${path.basename(bundlePath)}': CFBundleSupportedPlatforms is not a valid list`);
    }
    return result;
  }

  /**
   *
   * @param {string} bundlePath Full path to the .ipa or .app bundle
   * @returns {Promise<string>}
   */
  async extractExecutableName (bundlePath) {
    return await this.extractManifestProperty(bundlePath, 'CFBundleExecutable');
  }

  /**
   *
   * @param {string} bundlePath Full path to the .ipa or .app bundle
   * @returns {Promise<import('@appium/types').StringRecord>} The payload of the manifest plist
   * @throws {Error} If the given app is not a valid bundle
   */
  async put (bundlePath) {
    return (await fs.stat(bundlePath)).isFile()
      ? await this._putIpa(bundlePath)
      : await this._putApp(bundlePath);
  }

  /**
   * @param {string} ipaPath Fill path to the .ipa bundle
   * @returns {Promise<import('@appium/types').StringRecord>} The payload of the manifest plist
   */
  async _putIpa(ipaPath) {
    /** @type {import('@appium/types').StringRecord|undefined} */
    let manifestPayload;
    /** @type {Error|undefined} */
    let lastError;
    try {
      await zip.readEntries(ipaPath, async ({entry, extractEntryTo}) => {
        // For a furutre reference:
        // If the directory name includes `.app` suffix (case insensitive) like 'Payload/something.App.app/filename',
        // then 'entry.fileName' would return 'Payload/something.App/filename'.
        // The behavior is specific for unzip. Technically such naming is possible and valid,
        // although Info.plist retrival would fail in Appium.

        // https://github.com/appium/appium/issues/20075
        if (!IPA_ROOT_PLIST_PATH_PATTERN.test(entry.fileName)) {
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
          manifestPayload = await this._readPlist(plistPath, ipaPath);
          if (_.isPlainObject(manifestPayload) && entry.uncompressedSize <= MAX_MANIFEST_SIZE) {
            this.log.debug(
              `Caching the manifest '${entry.fileName}' for ${manifestPayload?.CFBundleIdentifier} app ` +
              `from the compressed source using the key '${hash}'`
            );
            MANIFEST_CACHE.set(hash, manifestPayload);
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
      throw new Error(`Cannot find ${MANIFEST_FILE_NAME} in '${ipaPath}'. Is it a valid application bundle?`);
    }
    if (!manifestPayload) {
      let errorMessage = `Cannot extract ${MANIFEST_FILE_NAME} from '${ipaPath}'. Is it a valid application bundle?`;
      if (lastError) {
        errorMessage += ` Original error: ${lastError.message}`;
      }
      throw new Error(errorMessage);
    }
    return manifestPayload;
  }

  /**
   * @param {string} appPath Fill path to the .app bundle
   * @returns {Promise<import('@appium/types').StringRecord>} The payload of the manifest plist
   */
  async _putApp(appPath) {
    const manifestPath = path.join(appPath, MANIFEST_FILE_NAME);
    const hash = await fs.hash(manifestPath);
    if (MANIFEST_CACHE.has(hash)) {
      return /** @type {import('@appium/types').StringRecord} */ (MANIFEST_CACHE.get(hash));
    }
    const [payload, stat] = await B.all([
      this._readPlist(manifestPath, appPath),
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

  /**
   * @param {string} plistPath Full path to the plist
   * @param {string} bundlePath Full path to .ipa or .app bundle
   * @returns {Promise<any>} The payload of the plist file
   */
  async _readPlist(plistPath, bundlePath) {
    try {
      return await plist.parsePlistFile(plistPath);
    } catch (e) {
      this.log.debug(e.stack);
      throw new Error(`Cannot parse ${MANIFEST_FILE_NAME} of '${bundlePath}'. Is it a valid application bundle?`);
    }
  }
}
