import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import stream from 'stream';
import unzip from 'unzip';
import path from 'path';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

if (!process.env.REAL_DEVICE) {
  describe('XCUITestDriver - file movement', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver;
    before(async function () {
      driver = await initSession(UICATALOG_CAPS);
    });
    after(async () => {
      await deleteSession();
    });

    async function pullFileAsString (remotePath) {
      let remoteData64 = await driver.pullFile(remotePath);
      return new Buffer(remoteData64, 'base64').toString();
    }

    describe('sim relative', function () {
      describe('files', () => {
        it('should not be able to fetch a file from the file system at large', async () => {
          await driver.pullFile(__filename).should.eventually.be.rejected;
        });

        it('should be able to fetch the Address book', async () => {
          let file = 'Library/AddressBook/AddressBook.sqlitedb';
          let stringData = await pullFileAsString(file);
          stringData.indexOf('SQLite').should.not.equal(-1);
        });

        it('should not be able to fetch something that does not exist', async () => {
          await driver.pullFile('Library/AddressBook/nothere.txt')
            .should.eventually.be.rejectedWith(/13/);
        });

        it('should be able to push and pull a file', async () => {
          let stringData = `random string data ${Math.random()}`;
          let base64Data = new Buffer(stringData).toString('base64');
          let remotePath = 'Library/AppiumTest/remote.txt';

          await driver.pushFile(remotePath, base64Data);
          let remoteStringData = await pullFileAsString(remotePath);
          remoteStringData.should.equal(stringData);
        });
      });

      describe('folders', () => {
        it('should not pull folders from file system', async () => {
          await driver.pullFolder(__dirname).should.eventually.be.rejected;
        });

        it('should not be able to fetch a folder that does not exist', async () => {
          await driver.pullFolder('Library/Rollodex')
            .should.eventually.be.rejectedWith(/13/);
        });

        it('should pull all the files in Library/AddressBook', async () => {
          let entryCount = 0;
          let data = await driver.pullFolder('Library/AddressBook');
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

    describe('app relative', () => {
      it('should be able to push and pull a file from the app directory', async () => {
        let stringData = `random string data ${Math.random()}`;
        let base64Data = new Buffer(stringData).toString('base64');
        let remotePath = path.resolve('/UICatalog.app', 'somefile.tmp');

        await driver.pushFile(remotePath, base64Data);
        let remoteStringData = await pullFileAsString(remotePath);
        remoteStringData.should.equal(stringData);
      });
    });
  });
}
