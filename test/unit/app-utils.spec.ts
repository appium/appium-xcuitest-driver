import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, before} from 'node:test';

import {fs, tempDir, zip} from 'appium/support.js';
import {createSandbox} from 'sinon';

import {onDownloadApp, unzipStream, unzipFile} from '../../lib/commands/helpers/app.js';
import {XCUITestDriver} from '../../lib/driver.js';
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

  describe('onDownloadApp', function () {
    it('should select an .ipa nested in a remote .zip on a real device', async function () {
      try {
        await fs.which('bsdtar');
      } catch {
        return;
      }

      const sandbox = createSandbox();
      const tmpDir = await tempDir.openDir();
      let resultPath: string | undefined;
      try {
        const payloadDir = path.join(tmpDir, 'stage', 'Payload', 'UIKitCatalog.app');
        await fs.mkdirp(payloadDir);
        await fs.copyFile(path.join(uiCatalogAppPath, 'Info.plist'), path.join(payloadDir, 'Info.plist'));
        const archiveRoot = path.join(tmpDir, 'archive', 'sub');
        await fs.mkdirp(archiveRoot);
        await zip.toArchive(path.join(archiveRoot, 'Foo.ipa'), {cwd: path.join(tmpDir, 'stage')});
        const zipPath = path.join(tmpDir, 'build.zip');
        await zip.toArchive(zipPath, {cwd: path.join(tmpDir, 'archive')});

        const driver = new XCUITestDriver({} as any);
        sandbox.stub(driver, 'isRealDevice').returns(true);
        resultPath = await onDownloadApp.call(driver, {
          url: 'http://example.com/build.zip',
          headers: {'content-disposition': 'attachment; filename="build.zip"'},
          stream: fs.createReadStream(zipPath),
        });
        assert.strictEqual(path.basename(resultPath), 'Foo.ipa');
        assert.strictEqual(await fs.exists(resultPath), true);
      } finally {
        sandbox.restore();
        await fs.rimraf(tmpDir);
        if (resultPath) {
          await fs.rimraf(path.dirname(resultPath));
        }
      }
    });
  });
});
