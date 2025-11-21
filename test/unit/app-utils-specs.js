import {
  unzipStream,
  unzipFile,
} from '../../lib/app-utils';
import { fs, tempDir, zip } from 'appium/support';
import path from 'node:path';
import {getUIKitCatalogPath} from '../setup.js';


describe('app-utils', function () {
  let chai;
  let uiCatalogAppPath;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

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
        await fs.exists(path.resolve(appRoot, 'Info.plist')).should.eventually.be.true;
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
        await unzipStream(srcStream).should.be.rejected;
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
        await fs.exists(path.resolve(appRoot, 'Info.plist')).should.eventually.be.true;
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
        await unzipFile(tmpSrc).should.be.rejected;
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });
});
