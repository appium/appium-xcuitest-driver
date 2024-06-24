import {
  unzipStream,
  unzipFile,
} from '../../lib/app-utils';
import { fs, tempDir, zip } from 'appium/support';
import path from 'node:path';


describe('app-utils', function () {
  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    expect = chai.expect;
  });

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
        ({rootDir: appRoot} = await unzipStream(srcStream));
        expect(await fs.exists(path.resolve(appRoot, 'Info.plist'))).to.be.true;
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
        expect(await unzipStream(srcStream)).to.be.rejected;
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
        ({rootDir: appRoot} = await unzipFile(tmpSrc));
        expect(await fs.exists(path.resolve(appRoot, 'Info.plist'))).tp.be.true;
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
        expect(await unzipFile(tmpSrc)).to.be.rejected;
      } finally {
        await fs.rimraf(tmpDir);
      }
    });
  });
});
