import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { fs, tempDir, zip } from 'appium-support';
import path from 'path';


chai.should();
chai.use(chaiAsPromised);

const UICAT_CONTAINER = `@com.example.apple-samplecode.UICatalog`;

async function pullFileAsString (driver, remotePath) {
  let remoteData64 = await driver.pullFile(remotePath);
  return Buffer.from(remoteData64, 'base64').toString();
}

if (!process.env.REAL_DEVICE && !process.env.REMOTE) {
  describe('XCUITestDriver - file movement', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver;
    before(async function () {
      driver = await initSession(UICATALOG_CAPS);
    });
    after(async function () {
      await deleteSession();
    });

    describe('sim relative', function () {
      describe('files', function () {
        it('should not be able to fetch a file from the file system at large', async function () {
          await driver.pullFile(__filename).should.eventually.be.rejected;
        });

        it('should be able to fetch the Address book', async function () {
          let stringData = await pullFileAsString(driver, `${UICAT_CONTAINER}/PkgInfo`);
          stringData.indexOf('APPL').should.not.equal(-1);
        });

        it('should not be able to fetch something that does not exist', async function () {
          await driver.pullFile('Library/AddressBook/nothere.txt')
            .should.eventually.be.rejectedWith(/13/);
        });

        it('should be able to push and pull a file', async function () {
          const stringData = `random string data ${Math.random()}`;
          const base64Data = Buffer.from(stringData).toString('base64');
          const remotePath = `${UICAT_CONTAINER}/remote.txt`;

          await driver.pushFile(remotePath, base64Data);

          const remoteStringData = await pullFileAsString(driver, remotePath);
          remoteStringData.should.equal(stringData);
        });

        it('should be able to delete a file', async function () {
          const stringData = `random string data ${Math.random()}`;
          const base64Data = Buffer.from(stringData).toString('base64');
          const remotePath = `${UICAT_CONTAINER}/remote.txt`;

          await driver.pushFile(remotePath, base64Data);

          const remoteStringData = await pullFileAsString(driver, remotePath);
          remoteStringData.should.equal(stringData);

          await driver.execute('mobile: deleteFile', {remotePath});

          await pullFileAsString(driver, remotePath).should.eventually.be.rejectedWith(/does not exist/);
        });
      });

      describe('folders', function () {
        it('should not pull folders from file system', async function () {
          await driver.pullFolder(__dirname).should.eventually.be.rejected;
        });

        it('should not be able to fetch a folder that does not exist', async function () {
          await driver.pullFolder('Library/Rollodex')
            .should.eventually.be.rejectedWith(/13/);
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
            itemsCount.should.be.above(1);
          } finally {
            await fs.rimraf(tmpRoot);
          }
        });
      });
    });

    describe('app relative', function () {
      it('should be able to push and pull a file from the app directory', async function () {
        let stringData = `random string data ${Math.random()}`;
        let base64Data = Buffer.from(stringData).toString('base64');
        let remotePath = `${UICAT_CONTAINER}/UICatalog.app/somefile.tmp`;

        await driver.pushFile(remotePath, base64Data);
        let remoteStringData = await pullFileAsString(driver, remotePath);
        remoteStringData.should.equal(stringData);
      });

      it('should be able to delete a file from the app directory', async function () {
        const stringData = `random string data ${Math.random()}`;
        const base64Data = Buffer.from(stringData).toString('base64');
        const remotePath = `${UICAT_CONTAINER}/UICatalog.app/somefile.tmp`;

        await driver.pushFile(remotePath, base64Data);

        const remoteStringData = await pullFileAsString(driver, remotePath);
        remoteStringData.should.equal(stringData);

        await driver.execute('mobile: deleteFile', {remotePath});

        await pullFileAsString(driver, remotePath).should.eventually.be.rejectedWith(/does not exist/);
      });
    });
  });
}
