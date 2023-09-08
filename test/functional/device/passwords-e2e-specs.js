import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {MOCHA_TIMEOUT, initSession, deleteSession, hasDefaultPrebuiltWDA} from '../helpers/session';
import {UICATALOG_CAPS, amendCapabilities} from '../desired';

chai.should();
chai.use(chaiAsPromised);

describe('Passwords', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver, caps;

  beforeEach(function () {
    caps = amendCapabilities(UICATALOG_CAPS, {
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });
  });

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await deleteSession();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });

  describe('AutoFillPasswords', function () {
    async function isPasswordsMenuShown(driver) {
      const el = await driver.$('~Text Fields');
      await el.click();

      const textField = await driver.$('XCUIElementTypeSecureTextField');
      await textField.waitForExist({timeout: 500});
      await textField.click();

      const passwordsMenu = await driver.$('~Passwords');
      return await passwordsMenu.isExisting();
    }

    it('should enable password autofill menu in the keyboard', async function () {
      caps = amendCapabilities(caps, {'appium:autoFillPasswords': true});
      driver = await initSession(caps);
      await isPasswordsMenuShown(driver).should.eventually.eql(true);
    });
    it('should disable password autofill menu in the keyboard', async function () {
      caps = amendCapabilities(caps, {'appium:autoFillPasswords': false});
      driver = await initSession(caps);
      await isPasswordsMenuShown(driver).should.eventually.eql(false);
    });
  });
});
