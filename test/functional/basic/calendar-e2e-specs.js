import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { TESTAPP_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

if (!process.env.REAL_DEVICE) {

  describe('XCUITestDriver - calendar', function () {
    this.timeout(MOCHA_TIMEOUT);

    let driver, caps;

    beforeEach(() => {
      caps = Object.assign({}, TESTAPP_CAPS);
    });

    afterEach(async () => {
      await deleteSession();
    });

    it('should authorize calendar access if calendarAccessAuthorized == true', async () => {
      caps.calendarAccessAuthorized = true;
      driver = await initSession(caps);
      let checkCalendarButton = await driver.elementByName('Check calendar authorized');
      await checkCalendarButton.click();
      await driver.elementByName('authorized');
    });

    it('should disable calendar access if calendarAccessAuthorized == false', async () => {
      caps.calendarAccessAuthorized = false;
      driver = await initSession(caps);
      let checkCalendarButton = await driver.elementByName('Check calendar authorized');
      await checkCalendarButton.click();
      await driver.elementByName('not authorized');
    });
  });

}
