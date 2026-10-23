import path from 'node:path';

import type {AppiumLogger, StringRecord} from '@appium/types';
import {fs, plist, tempDir, zip} from 'appium/support.js';
import {LRUCache} from 'lru-cache';

import type {WatchAppInfo} from './types.js';
import {escapeRegExp, isPlainObject} from './utils/index.js';

const MANIFEST_CACHE = new LRUCache<string, StringRecord>({
  max: 40,
  updateAgeOnHas: true,
});
const MANIFEST_FILE_NAME = 'Info.plist';
const IPA_ROOT_PLIST_PATH_PATTERN = new RegExp(`^Payload/[^/]+\\.app/${escapeRegExp(MANIFEST_FILE_NAME)}$`);
const MAX_MANIFEST_SIZE = 1024 * 1024; // 1 MiB
const APP_BUNDLE_ID_PROPERTY = 'CFBundleIdentifier';
const APP_PLATFORMS_PROPERTY = 'CFBundleSupportedPlatforms';
/**
 * The identifier of the iOS application a watch application needs on the paired phone.
 */
const COMPANION_APP_BUNDLE_ID_PROPERTY = 'WKCompanionAppBundleIdentifier';
/**
 * The reference an iOS application uses to point at the watch application it owns.
 */
const COMPANION_WATCH_BUNDLE_ID_PROPERTY = 'WKWatch1To1CompanionKey';
/**
 * WatchOS packaging flags that make a watch application installable on its own.
 */
const STANDALONE_WATCH_BUNDLE_PROPERTIES = ['WKWatchOnly', '1KitProvisioningComponent'] as const;

/**
 * @param value The raw value of a manifest key that is expected to hold a bundle identifier
 * @returns The value as a non-empty string, or `undefined` if it carries no identifier
 */
function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * @param value The raw value of a watchOS packaging flag
 * @returns Whether the flag is set
 */
function isStandaloneWatchFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    // `1KitProvisioningComponent` carries a component name (e.g. 'com.apple.reviewkit') rather
    // than a boolean, so any non-empty value at all means the flag is set.
    return Boolean(value.trim());
  }
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export class AppInfosCache {
  private readonly log: AppiumLogger;

  constructor(log: AppiumLogger) {
    this.log = log;
  }

  /**
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @param propertyName
   * @returns
   */
  async extractManifestProperty(bundlePath: string, propertyName: string): Promise<any> {
    const result = (await this.put(bundlePath))[propertyName];
    this.log.debug(`${propertyName}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @returns
   */
  async extractBundleId(bundlePath: string): Promise<string> {
    return await this.extractManifestProperty(bundlePath, 'CFBundleIdentifier');
  }

  /**
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @returns
   */
  async extractBundleVersion(bundlePath: string): Promise<string> {
    return await this.extractManifestProperty(bundlePath, 'CFBundleVersion');
  }

  /**
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @returns
   */
  async extractAppPlatforms(bundlePath: string): Promise<string[]> {
    const result = this._extractPlatforms(await this.put(bundlePath), bundlePath);
    this.log.debug(`${APP_PLATFORMS_PROPERTY}: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Reads the watchOS packaging metadata of the given application bundle.
   *
   * Watch applications declare the iOS application they need on the paired phone via
   * `WKCompanionAppBundleIdentifier`, or that they are installable on their own via
   * `WKWatchOnly`/`1KitProvisioningComponent`, while iOS applications that own a watch
   * application reference it via `WKWatch1To1CompanionKey`.
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @returns The bundle identifier, the supported platforms, the related companion
   * bundle identifiers (if any) and whether the bundle is a standalone watch application
   * @throws If the given app is not a valid bundle
   */
  async extractWatchAppInfo(bundlePath: string): Promise<WatchAppInfo> {
    const manifestPayload = await this.put(bundlePath);
    const oneToOneCompanion = manifestPayload[COMPANION_WATCH_BUNDLE_ID_PROPERTY];
    const info: WatchAppInfo = {
      bundleId: toNonEmptyString(manifestPayload[APP_BUNDLE_ID_PROPERTY]) ?? '',
      platforms: this._extractPlatforms(manifestPayload, bundlePath),
      companionAppBundleId: toNonEmptyString(manifestPayload[COMPANION_APP_BUNDLE_ID_PROPERTY]),
      // A 1:1 companion reference is either a plain bundle identifier or a dictionary
      // carrying additional packaging information.
      companionWatchBundleId: toNonEmptyString(
        isPlainObject(oneToOneCompanion) ? oneToOneCompanion.BundleIdentifier : oneToOneCompanion,
      ),
      isStandalone: STANDALONE_WATCH_BUNDLE_PROPERTIES.some((propertyName) =>
        isStandaloneWatchFlag(manifestPayload[propertyName]),
      ),
    };
    this.log.debug(
      `Watch application info for '${path.basename(bundlePath)}': ${info.bundleId}; ` +
        `platforms=${info.platforms.join(',')}; companion iOS app=${info.companionAppBundleId ?? 'none'}; ` +
        `standalone=${info.isStandalone}`,
    );
    return info;
  }

  /**
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @returns
   */
  async extractExecutableName(bundlePath: string): Promise<string> {
    return await this.extractManifestProperty(bundlePath, 'CFBundleExecutable');
  }

  /**
   *
   * @param bundlePath Full path to the .ipa or .app bundle
   * @returns The payload of the manifest plist
   * @throws If the given app is not a valid bundle
   */
  async put(bundlePath: string): Promise<StringRecord> {
    return (await fs.stat(bundlePath)).isFile() ? await this._putIpa(bundlePath) : await this._putApp(bundlePath);
  }

  /**
   * @param ipaPath Fill path to the .ipa bundle
   * @returns The payload of the manifest plist
   */
  private async _putIpa(ipaPath: string): Promise<StringRecord> {
    let manifestPayload: StringRecord | undefined;
    let lastError: Error | undefined;
    try {
      await zip.readEntries(ipaPath, async ({entry, extractEntryTo}) => {
        // For a future reference:
        // If the directory name includes `.app` suffix (case insensitive) like 'Payload/something.App.app/filename',
        // then 'entry.fileName' would return 'Payload/something.App/filename'.
        // The behavior is specific for unzip. Technically such naming is possible and valid,
        // although Info.plist retrieval would fail in Appium.

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
          if (isPlainObject(manifestPayload) && entry.uncompressedSize <= MAX_MANIFEST_SIZE) {
            this.log.debug(
              `Caching the manifest '${entry.fileName}' for ${manifestPayload?.CFBundleIdentifier} app ` +
                `from the compressed source using the key '${hash}'`,
            );
            MANIFEST_CACHE.set(hash, manifestPayload);
          }
        } catch (e: any) {
          this.log.debug(e.stack);
          lastError = e;
        } finally {
          await fs.rimraf(tmpRoot);
        }
        return false;
      });
    } catch (e: any) {
      this.log.debug(e.stack);
      throw new Error(`Cannot find ${MANIFEST_FILE_NAME} in '${ipaPath}'. Is it a valid application bundle?`, {
        cause: e,
      });
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
   * @param appPath Fill path to the .app bundle
   * @returns The payload of the manifest plist
   */
  private async _putApp(appPath: string): Promise<StringRecord> {
    const manifestPath = path.join(appPath, MANIFEST_FILE_NAME);
    const hash = await fs.hash(manifestPath);
    const cached = MANIFEST_CACHE.get(hash);
    if (cached) {
      return cached;
    }
    const [payload, stat] = await Promise.all([this._readPlist(manifestPath, appPath), fs.stat(manifestPath)]);
    if (stat.size <= MAX_MANIFEST_SIZE && isPlainObject(payload)) {
      this.log.debug(
        `Caching the manifest for ${payload.CFBundleIdentifier} app from a file source using the key '${hash}'`,
      );
      MANIFEST_CACHE.set(hash, payload);
    }
    return payload;
  }

  /**
   * @param plistPath Full path to the plist
   * @param bundlePath Full path to .ipa or .app bundle
   * @returns The payload of the plist file
   */
  private async _readPlist(plistPath: string, bundlePath: string): Promise<any> {
    try {
      return await plist.parsePlistFile(plistPath);
    } catch (e: any) {
      this.log.debug(e.stack);
      throw new Error(`Cannot parse ${MANIFEST_FILE_NAME} of '${bundlePath}'. Is it a valid application bundle?`, {
        cause: e,
      });
    }
  }

  /**
   * @param manifestPayload The payload of the manifest plist
   * @param bundlePath Full path to .ipa or .app bundle
   * @returns The list of platforms supported by the bundle
   * @throws If the manifest does not define a valid `CFBundleSupportedPlatforms` list
   */
  private _extractPlatforms(manifestPayload: StringRecord, bundlePath: string): string[] {
    const result = manifestPayload[APP_PLATFORMS_PROPERTY];
    if (!Array.isArray(result)) {
      throw new Error(`${path.basename(bundlePath)}': ${APP_PLATFORMS_PROPERTY} is not a valid list`);
    }
    return result.map((platform) => String(platform));
  }
}
