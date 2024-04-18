import {
  unzipStream,
  unzipFile,
} from '../../lib/app-utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fs, tempDir, zip } from 'appium/support';
import path from 'node:path';

chai.should();
chai.use(chaiAsPromised);

describe('app-utils', function () {
  describe('unzipStream', function () {
    it('should unzip from stream', async function () {
      try {
        await fs.which('bsdtar');
      } catch (e) {
        return;
      }

      const tmpDir = await tempDir.openDir();
      let appRoot;
      let srcStream;
      try {
        const tmpSrc = path.join(tmpDir, 'temp.zip');
        await zip.toArchive(tmpSrc, {
          cwd: path.resolve(__dirname, '..', 'assets', 'biometric.app'),
        });
        srcStream = fs.createReadStream(tmpSrc);
        appRoot = await unzipStream(srcStream);
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
      } catch (e) {
        return;
      }

      const tmpDir = await tempDir.openDir();
      let srcStream;
      try {
        const tmpSrc = path.join(tmpDir, 'Info.plist');
        await fs.copyFile(path.resolve(__dirname, '..', 'assets', 'biometric.app', 'Info.plist'), tmpSrc);
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
          cwd: path.resolve(__dirname, '..', 'assets', 'biometric.app'),
        });
        appRoot = await unzipFile(tmpSrc);
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
        await fs.copyFile(path.resolve(__dirname, '..', 'assets', 'biometric.app', 'Info.plist'), tmpSrc);
        await unzipFile(tmpSrc).should.be.rejected;
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });
});
