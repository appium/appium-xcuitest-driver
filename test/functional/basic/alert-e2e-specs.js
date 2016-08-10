import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import { UICATALOG_CAPS } from '../desired';
import { clickBack } from '../helpers/navigation';
import { initSession, deleteSession } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - alerts', function () {
  this.timeout(200 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(deleteSession);


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
