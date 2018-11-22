import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { mjpeg } from 'appium-support';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

const MJPEG_SERVER_PORT = 8589;
const MJPEG_SERVER_URL = `http://localhost:${MJPEG_SERVER_PORT}`;

describe('XCUITestDriver - screenshots - mjpeg server', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver, mjpegServer;

  before(async function () {
    mjpegServer = mjpeg.initMJpegServer(MJPEG_SERVER_PORT);
    driver = await initSession({
      ...UICATALOG_CAPS,
      mjpegScreenshotUrl: MJPEG_SERVER_URL
    });
  });

  after(async function () {
    await deleteSession();
    mjpegServer.close();
  });

  it('should get the jpeg formatted screenshot via an mjpeg server if requested', async function () {
    const img = await driver.takeScreenshot();
    img.indexOf('/9j/4A').should.eql(0);
    img.length.should.be.above(400);
  });
});
