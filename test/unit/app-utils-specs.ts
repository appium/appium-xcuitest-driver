import {unzipStream, unzipFile} from '../../lib/app-utils';
import {fs, tempDir, zip} from 'appium/support';
import path from 'node:path';
import {getUIKitCatalogPath} from '../setup';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('app-utils', function () {
  let uiCatalogAppPath;

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
        await expect(fs.exists(path.resolve(appRoot, 'Info.plist'))).to.eventually.be.true;
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
        await expect(unzipStream(srcStream)).to.be.rejected;
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
        await expect(fs.exists(path.resolve(appRoot, 'Info.plist'))).to.eventually.be.true;
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
        await expect(unzipFile(tmpSrc)).to.be.rejected;
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });
});
