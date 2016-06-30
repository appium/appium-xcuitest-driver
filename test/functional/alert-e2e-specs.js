import { startServer } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import wd from 'wd';
import B from 'bluebird';
import { UICATALOG_CAPS } from './desired';


chai.should();
chai.use(chaiAsPromised);

const HOST = "localhost",
      PORT = 4994;

async function clickBack (driver) {
  let el = (await driver.elementsByAccessibilityId('Back'))[0];
  if (el && (await el.isDisplayed())) {
    await el.click();
  }
}

describe('XCUITestDriver - alerts', function () {
  this.timeout(200 * 1000);

  let server, driver;
  before(async () => {
    driver = wd.promiseChainRemote(HOST, PORT);
    server = await startServer(PORT, HOST);
    await driver.init(UICATALOG_CAPS);
  });
  after(async () => {
    await driver.quit();
    await server.close();
  });

  beforeEach(async () => {
    let el1 = await driver.elementByAccessibilityId('Alert Views');
    await el1.click();
  });
  afterEach(async () => {
    await clickBack(driver);
  });

  it('should detect Simple', async () => {
    let el = await driver.elementByAccessibilityId('Simple');
    await el.click();
    await B.delay(2000);

    (await driver.alertText()).should.include('A Short Title Is Best');
    await driver.dismissAlert();
  });

  it('should detect Okay', async () => {
    let el = await driver.elementByAccessibilityId('Okay / Cancel');
    await el.click();
    await B.delay(2000);

    (await driver.alertText()).should.include('A Short Title Is Best');
    await driver.acceptAlert();
  });

  it('should detect Other', async () => {
    let el = await driver.elementByAccessibilityId('Other');
    await el.click();
    await B.delay(2000);

    (await driver.alertText()).should.include('A Short Title Is Best');
    await driver.dismissAlert();
  });
});
