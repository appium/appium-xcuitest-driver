import {MOCHA_TIMEOUT, initSession, deleteSession, hasDefaultPrebuiltWDA} from '../helpers/session';
import {UICATALOG_CAPS, amendCapabilities, extractCapabilityValue} from '../desired';
import {util} from 'appium/support';


describe('Passwords', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver, caps;

  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    expect = chai.expect;
  });

  beforeEach(function () {
    caps = amendCapabilities(UICATALOG_CAPS, {
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });

    if (util.compareVersions(extractCapabilityValue(caps, 'appium:platformVersion'), '<', '16.4')) {
      return this.skip();
    }
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
      expect(await isPasswordsMenuShown(driver)).to.eql(true);
    });
    it('should disable password autofill menu in the keyboard', async function () {
      caps = amendCapabilities(caps, {'appium:autoFillPasswords': false});
      driver = await initSession(caps);
      expect(await isPasswordsMenuShown(driver)).to.eql(false);
    });
  });
});
