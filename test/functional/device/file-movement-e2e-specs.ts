import {getUICatalogCaps} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {fs, tempDir, zip} from 'appium/support';
import path from 'node:path';
import {UICATALOG_BUNDLE_ID} from '../../setup';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const UICAT_CONTAINER = `@${UICATALOG_BUNDLE_ID}`;

async function pullFileAsString(driver: any, remotePath: string) {
  const remoteData64 = await driver.pullFile(remotePath);
  return Buffer.from(remoteData64, 'base64').toString();
}

describe('XCUITestDriver - file movement', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('sim relative', function () {
    describe('files', function () {
      it('should not be able to fetch a file from the file system at large', async function () {
        await expect(driver.pullFile(__filename)).to.be.rejected;
      });

      it('should be able to fetch the Address book', async function () {
        const stringData = await pullFileAsString(driver, `${UICAT_CONTAINER}/PkgInfo`);
        expect(stringData.indexOf('APPL')).to.not.equal(-1);
      });

      it('should not be able to fetch something that does not exist', async function () {
        await expect(driver.pullFile('Library/AddressBook/nothere.txt')).to.be.rejectedWith(
          /does not exist/,
        );
      });

      it('should be able to push and pull a file', async function () {
        const stringData = `random string data ${Math.random()}`;
        const base64Data = Buffer.from(stringData).toString('base64');
        const remotePath = `${UICAT_CONTAINER}/remote.txt`;

        await driver.pushFile(remotePath, base64Data);

        const remoteStringData = await pullFileAsString(driver, remotePath);
        expect(remoteStringData).to.equal(stringData);
      });

      it('should be able to delete a file', async function () {
        const stringData = `random string data ${Math.random()}`;
        const base64Data = Buffer.from(stringData).toString('base64');
        const remotePath = `${UICAT_CONTAINER}/remote.txt`;

        await driver.pushFile(remotePath, base64Data);

        const remoteStringData = await pullFileAsString(driver, remotePath);
        expect(remoteStringData).to.equal(stringData);

        await driver.execute('mobile: deleteFile', {remotePath});

        await expect(pullFileAsString(driver, remotePath)).to.be.rejectedWith(/does not exist/);
      });
    });

    describe('folders', function () {
      it('should not pull folders from file system', async function () {
        await expect(driver.pullFolder(__dirname)).to.be.rejected;
      });

      it('should not be able to fetch a folder that does not exist', async function () {
        await expect(driver.pullFolder('Library/Rollodex')).to.be.rejectedWith(/does not exist/);
      });

      it('should pull all the files in Library/AddressBook', async function () {
        const remotePath = `Library/AddressBook`;
        const data = await driver.pullFolder(remotePath);
        const tmpRoot = await tempDir.openDir();
        try {
          const zipPath = path.resolve(tmpRoot, 'data.zip');
          const extractedDataPath = path.resolve(tmpRoot, 'extracted_data');
          await fs.writeFile(zipPath, Buffer.from(data, 'base64'));
          await fs.mkdir(extractedDataPath);
          await zip.extractAllTo(zipPath, extractedDataPath);
          const itemsCount = (await fs.readdir(extractedDataPath)).length;
          expect(itemsCount).to.be.above(1);
        } finally {
          await fs.rimraf(tmpRoot);
        }
      });
    });
  });

  describe('app relative', function () {
    it('should be able to push and pull a file from the app directory', async function () {
      const stringData = `random string data ${Math.random()}`;
      const base64Data = Buffer.from(stringData).toString('base64');
      const remotePath = `${UICAT_CONTAINER}/UICatalog.app/somefile.tmp`;

      await driver.pushFile(remotePath, base64Data);
      const remoteStringData = await pullFileAsString(driver, remotePath);
      expect(remoteStringData).to.equal(stringData);
    });

    it('should be able to delete a file from the app directory', async function () {
      const stringData = `random string data ${Math.random()}`;
      const base64Data = Buffer.from(stringData).toString('base64');
      const remotePath = `${UICAT_CONTAINER}/UICatalog.app/somefile.tmp`;

      await driver.pushFile(remotePath, base64Data);

      const remoteStringData = await pullFileAsString(driver, remotePath);
      expect(remoteStringData).to.equal(stringData);

      await driver.execute('mobile: deleteFile', {remotePath});

      await expect(pullFileAsString(driver, remotePath)).to.be.rejectedWith(/does not exist/);
    });
  });
});
