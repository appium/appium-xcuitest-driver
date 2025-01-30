import {PREDICATE_SEARCH} from '../helpers/element';
import {MOCHA_TIMEOUT, initSession, deleteSession, hasDefaultPrebuiltWDA} from '../helpers/session';
import {SETTINGS_CAPS, amendCapabilities} from '../desired';


describe('Accessibility', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver, caps;

  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);
  });

  beforeEach(function () {
    caps = amendCapabilities(SETTINGS_CAPS, {
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });
  });

  afterEach(async function () {
    try {
      await driver.terminateApp('com.apple.Preferences');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }

    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    try {
      await deleteSession();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  });

  async function showAccessibilityTab(driver) {
    await driver
      .$(`${PREDICATE_SEARCH}:name == 'Accessibility'`)
      .click();
  }

  describe('ReduceMotion', function () {
    async function getReduceMotion(driver) {
      await showAccessibilityTab(driver);
      await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name IN {'Reduce Motion', 'Motion'}`)
        .click();
      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name == 'Reduce Motion'`)
        .getAttribute('value');
    }

    it('should enable reduce motion', async function () {
      caps = amendCapabilities(caps, {'appium:reduceMotion': true});
      driver = await initSession(caps);
      await getReduceMotion(driver).should.eventually.eql('1');
    });
    it('should disable reduce motion', async function () {
      caps = amendCapabilities(caps, {'appium:reduceMotion': false});
      driver = await initSession(caps);
      await getReduceMotion(driver).should.eventually.eql('0');
    });
  });

  describe('ReduceTransparency', function () {
    async function getReduceTransparency(driver) {
      await showAccessibilityTab(driver);
      await driver
        .$(
          `${PREDICATE_SEARCH}:name == 'Display & Text Size'`,
        )
        .click();
      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name == 'Reduce Transparency'`)
        .getAttribute('value');
    }

    it('should enable reduce transparency', async function () {
      caps = amendCapabilities(caps, {'appium:reduceTransparency': true});
      driver = await initSession(caps);
      await getReduceTransparency(driver).should.eventually.eql('1');
    });
    it('should disable reduce transparency', async function () {
      caps = amendCapabilities(caps, {'appium:reduceTransparency': false});
      driver = await initSession(caps);
      await getReduceTransparency(driver).should.eventually.eql('0');
    });
  });
});
