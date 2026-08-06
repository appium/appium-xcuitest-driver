import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, before} from 'node:test';

import {fs, tempDir, zip} from 'appium/support.js';

import {unzipStream, unzipFile} from '../../lib/commands/helpers/app.js';
import {getUIKitCatalogPath} from '../setup.js';

describe('app-utils', function () {
  let uiCatalogAppPath: string;

  before(async function () {
    // Download the UIKitCatalog app dynamically
    uiCatalogAppPath = await getUIKitCatalogPath();
  });

  describe('unzipStream', function () {
    it('should unzip from stream', async function () {
      try {
        await fs.which('bsdtar');
      } catch {
        return;
      }

      const tmpDir = await tempDir.openDir();
      let appRoot;
      let srcStream;
      try {
        const tmpSrc = path.join(tmpDir, 'temp.zip');
        await zip.toArchive(tmpSrc, {
          cwd: uiCatalogAppPath,
        });
        srcStream = fs.createReadStream(tmpSrc);
        ({rootDir: appRoot} = await unzipStream(srcStream));
        assert.strictEqual(await fs.exists(path.resolve(appRoot, 'Info.plist')), true);
      } finally {
        await fs.rimraf(tmpDir);
        if (appRoot) {
          await fs.rimraf(appRoot);
        }
      }
    });

    it('should fail for invalid archives', async function () {
      try {
        await fs.which('bsdtar');
      } catch {
        return;
      }

      const tmpDir = await tempDir.openDir();
      let srcStream;
      try {
        const tmpSrc = path.join(tmpDir, 'Info.plist');
        await fs.copyFile(path.join(uiCatalogAppPath, 'Info.plist'), tmpSrc);
        srcStream = fs.createReadStream(tmpSrc);
        await assert.rejects(unzipStream(srcStream));
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });

  describe('unzipFile', function () {
    it('should unzip from file', async function () {
      const tmpDir = await tempDir.openDir();
      let appRoot;
      try {
        const tmpSrc = path.join(tmpDir, 'temp.zip');
        await zip.toArchive(tmpSrc, {
          cwd: uiCatalogAppPath,
        });
        ({rootDir: appRoot} = await unzipFile(tmpSrc));
        assert.strictEqual(await fs.exists(path.resolve(appRoot, 'Info.plist')), true);
      } finally {
        await fs.rimraf(tmpDir);
        if (appRoot) {
          await fs.rimraf(appRoot);
        }
      }
    });

    it('should fail for invalid archives', async function () {
      const tmpDir = await tempDir.openDir();
      try {
        const tmpSrc = path.join(tmpDir, 'Info.plist');
        await fs.copyFile(path.join(uiCatalogAppPath, 'Info.plist'), tmpSrc);
        await assert.rejects(unzipFile(tmpSrc));
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });
});
