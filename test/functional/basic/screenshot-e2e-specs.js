import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { mjpeg } from 'appium-support';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

const MJPEG_SERVER_PORT = 8589;
const MJPEG_SERVER_URL = `http://localhost:${MJPEG_SERVER_PORT}`;
const PNG_MAGIC = '89504e47';
const PNG_MAGIC_LENGTH = 4;

describe('XCUITestDriver - screenshots - mjpeg server', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver, mjpegServer;

  before(async function () {
    // Don't do these tests on Sauce Labs
    if (process.env.CLOUD) {
      this.skip();
    }
    mjpegServer = mjpeg.initMJpegServer(MJPEG_SERVER_PORT);
    driver = await initSession({
      ...UICATALOG_CAPS,
      mjpegScreenshotUrl: MJPEG_SERVER_URL
    });
  });

  after(async function () {
    await deleteSession();
    if (mjpegServer) {
      mjpegServer.close();
    }
  });

  it('should get the screenshot via an mjpeg server if requested', async function () {
    const base64Image = await driver.takeScreenshot();

    const imageMagic = Buffer.from(base64Image, 'base64').toString('hex', 0, PNG_MAGIC_LENGTH);
    imageMagic.should.equal(PNG_MAGIC);
  });
});
