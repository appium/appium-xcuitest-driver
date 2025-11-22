import {
  AppInfosCache,
} from '../../lib/app-infos-cache';
import { fs, tempDir, zip } from 'appium/support';
import path from 'node:path';
import log from '../../lib/logger';
import {getUIKitCatalogPath, UICATALOG_BUNDLE_ID} from '../setup';
import {expect} from 'chai';

describe('AppInfosCache', function () {
  before(async function () {
    const chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');
    chai.use(chaiAsPromised.default);
  });

  describe('retrives info from different types of apps', function () {
    let ipaPath;
    let appPath;
    /** @type {AppInfosCache} */
    let cache;

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
      if (ipaPath && await fs.exists(ipaPath)) {
        await fs.rimraf(ipaPath);
        ipaPath = undefined;
      }
    });

    beforeEach(function () {
      cache = new AppInfosCache(log);
    });

    it('should cache ipa', async function () {
      const info = await cache.put(ipaPath);
      expect(await info.CFBundleIdentifier).to.eql(UICATALOG_BUNDLE_ID);
      const info2 = await cache.put(ipaPath);
      expect(info).to.equal(info2);
    });

    it('should cache app', async function () {
      const info = await cache.put(appPath);
      expect(await info.CFBundleIdentifier).to.eql(UICATALOG_BUNDLE_ID);
      const info2 = await cache.put(appPath);
      expect(info).to.equal(info2);
    });

    it('should extract cached info', async function () {
      await expect(cache.extractAppPlatforms(appPath)).to.eventually.eql(['iPhoneSimulator']);
      await expect(cache.extractBundleId(ipaPath)).to.eventually.eql(UICATALOG_BUNDLE_ID);
      await expect(cache.extractExecutableName(ipaPath)).to.eventually.eql('UIKitCatalog');
    });
  });
});
