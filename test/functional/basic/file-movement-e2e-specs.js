import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import stream from 'stream';
import unzip from 'unzip';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

const UICAT_CONTAINER = `@com.example.apple-samplecode.UICatalog`;

if (!process.env.REAL_DEVICE) {
  describe('XCUITestDriver - file movement', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver;
    before(async function () {
      driver = await initSession(UICATALOG_CAPS);
    });
    after(async function () {
      await deleteSession();
    });

    async function pullFileAsString (remotePath) {
      let remoteData64 = await driver.pullFile(remotePath);
      return Buffer.from(remoteData64, 'base64').toString();
    }

    describe('sim relative', function () {
      describe('files', function () {
        it('should not be able to fetch a file from the file system at large', async function () {
          await driver.pullFile(__filename).should.eventually.be.rejected;
        });

        it('should be able to fetch the Address book', async function () {
          let stringData = await pullFileAsString(`${UICAT_CONTAINER}/PkgInfo`);
          stringData.indexOf('APPL').should.not.equal(-1);
        });

        it('should not be able to fetch something that does not exist', async function () {
          await driver.pullFile('Library/AddressBook/nothere.txt')
            .should.eventually.be.rejectedWith(/13/);
        });

        it('should be able to push and pull a file', async function () {
          let stringData = `random string data ${Math.random()}`;
          let base64Data = Buffer.from(stringData).toString('base64');
          let remotePath = `${UICAT_CONTAINER}/remote.txt`;

          await driver.pushFile(remotePath, base64Data);
          let remoteStringData = await pullFileAsString(remotePath);
          remoteStringData.should.equal(stringData);
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
          let entryCount = 0;
          let remotePath = `Library/AddressBook`;
          let data = await driver.pullFolder(remotePath);
          await new B((resolve) => {
            let zipStream = new stream.Readable();
            zipStream._read = function noop () {};
            zipStream
              .pipe(unzip.Parse())
              .on('entry', function (entry) {
                entryCount++;
                entry.autodrain();
              })
              .on('close', function () {
                entryCount.should.be.above(1);
                resolve();
              });

            zipStream.push(data, 'base64');
            zipStream.push(null);
          });
        });
      });
    });

    describe('app relative', function () {
      it('should be able to push and pull a file from the app directory', async function () {
        let stringData = `random string data ${Math.random()}`;
        let base64Data = Buffer.from(stringData).toString('base64');
        let remotePath = `${UICAT_CONTAINER}/UICatalog.app/somefile.tmp`;

        await driver.pushFile(remotePath, base64Data);
        let remoteStringData = await pullFileAsString(remotePath);
        remoteStringData.should.equal(stringData);
      });
    });
  });
}
