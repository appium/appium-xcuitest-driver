import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, before, after, beforeEach} from 'node:test';

import {fs, tempDir, zip} from 'appium/support.js';

import {AppInfosCache} from '../../lib/app-infos-cache.js';
import {log} from '../../lib/logger.js';
import {getUIKitCatalogPath, UICATALOG_BUNDLE_ID} from '../setup.js';

describe('AppInfosCache', function () {
  describe('retrives info from different types of apps', function () {
    let ipaPath: string;
    let appPath: string;
    let cache: AppInfosCache;

    before(async function () {
      // Download the UIKitCatalog app dynamically
      appPath = await getUIKitCatalogPath();
      const tmpDir = await tempDir.openDir();
      try {
        const destDir = path.join(tmpDir, 'Payload', 'UIKitCatalog-iphonesimulator.app');
        await fs.mkdirp(destDir);
        await fs.copyFile(appPath, destDir);
        ipaPath = await tempDir.path({
          prefix: 'foo',
          suffix: '.ipa',
        });
        await zip.toArchive(ipaPath, {
          cwd: tmpDir,
        });
      } finally {
        await fs.rimraf(tmpDir);
      }
    });

    after(async function () {
      if (ipaPath && (await fs.exists(ipaPath))) {
        await fs.rimraf(ipaPath);
        ipaPath = '';
      }
    });

    beforeEach(function () {
      cache = new AppInfosCache(log);
    });

    it('should cache ipa', async function () {
      const info = await cache.put(ipaPath);
      assert.strictEqual(info.CFBundleIdentifier, UICATALOG_BUNDLE_ID);
      const info2 = await cache.put(ipaPath);
      assert.strictEqual(info, info2);
    });

    it('should cache app', async function () {
      const info = await cache.put(appPath);
      assert.strictEqual(info.CFBundleIdentifier, UICATALOG_BUNDLE_ID);
      const info2 = await cache.put(appPath);
      assert.strictEqual(info, info2);
    });

    it('should extract cached info', async function () {
      assert.deepStrictEqual(await cache.extractAppPlatforms(appPath), ['iPhoneSimulator']);
      assert.strictEqual(await cache.extractBundleId(ipaPath), UICATALOG_BUNDLE_ID);
      assert.strictEqual(await cache.extractExecutableName(ipaPath), 'UIKitCatalog');
    });
  });
});
