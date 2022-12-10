import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { TESTAPP_CAPS, amendCapabilities } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

if (!process.env.REAL_DEVICE && !process.env.CLOUD) {
  describe('XCUITestDriver - calendar', function() {
    this.timeout(MOCHA_TIMEOUT);

    let driver, caps;

    beforeEach(function() {
      caps = Object.assign({}, TESTAPP_CAPS);
    });

    afterEach(async function() {
      await deleteSession();
    });

    it('should authorize calendar access if calendarAccessAuthorized == true', async function() {
      caps = amendCapabilities(caps, { 'appium:calendarAccessAuthorized': true });
      driver = await initSession(caps);
      let checkCalendarButton = await driver.$(`//XCUIElementTypeButton[@name='Check calendar authorized']`);
      await checkCalendarButton.click();
      const statusText = await driver.$(`//XCUIElementTypeStaticText[@name='authorized']`);
      statusText.elementId.should.exist;
    });

    it('should disable calendar access if calendarAccessAuthorized == false', async function() {
      caps = amendCapabilities(caps, { 'appium:calendarAccessAuthorized': false });
      driver = await initSession(caps);
      let checkCalendarButton = await driver.$(`//XCUIElementTypeButton[@name='Check calendar authorized']`);
      await checkCalendarButton.click();
      const statusText = await driver.$(`//XCUIElementTypeStaticText[@name='not authorized']`);
      statusText.elementId.should.exist;
    });
  });

}
