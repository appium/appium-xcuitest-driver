import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { PREDICATE_SEARCH } from '../helpers/element';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SETTINGS_CAPS, amendCapabilities } from '../desired';

chai.should();
chai.use(chaiAsPromised);

describe('Accessibility', function() {
  this.timeout(MOCHA_TIMEOUT);

  let driver, caps;

  beforeEach(function() {
    caps = amendCapabilities(SETTINGS_CAPS, { 'appium:usePrebuiltWDA': true });
  });

  afterEach(async function() {
    await driver.terminateApp('com.apple.Preferences');

    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  async function showAccessibilityTab(driver) {
    let hasGeneralTab = false;
    try {
      // iOS 13 has Accessibility outside the General tab
      await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name == 'Accessibility'`)
        .click();
    } catch (err) {
      await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name == 'General'`)
        .click();
      await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name == 'Accessibility'`)
        .click();
      hasGeneralTab = true;
    }
    return hasGeneralTab;
  }

  describe('ReduceMotion', function() {
    async function getReduceMotion(driver) {
      const hasGeneralTab = await showAccessibilityTab(driver);
      const motionCellName = hasGeneralTab ? 'Reduce Motion' : 'Motion';
      await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name == '${motionCellName}'`)
        .click();
      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name == 'Reduce Motion'`)
        .getAttribute('value');
    }

    it('should enable reduce motion', async function() {
      caps = amendCapabilities(caps, { 'appium:reduceMotion': true });
      driver = await initSession(caps);
      await getReduceMotion(driver).should.eventually.be.eql('1');
    });
    it('should disable reduce motion', async function() {
      caps = amendCapabilities(caps, { 'appium:reduceMotion': false });
      driver = await initSession(caps);
      await getReduceMotion(driver).should.eventually.be.eql('0');
    });
  });

  describe('ReduceTransparency', function() {
    async function getReduceTransparency(driver) {
      await showAccessibilityTab(driver);
      await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeCell' AND name == '${'Display & Text Size'}'`)
        .click();
      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name == 'Reduce Transparency'`)
        .getAttribute('value');
    }

    it('should enable reduce transparency', async function() {
      caps = amendCapabilities(caps, { 'appium:reduceTransparency': true });
      driver = await initSession(caps);
      await getReduceTransparency(driver).should.eventually.be.eql('1');
    });
    it('should disable reduce transparency', async function() {
      caps = amendCapabilities(caps, { 'appium:reduceTransparency': false });
      driver = await initSession(caps);
      await getReduceTransparency(driver).should.eventually.be.eql('0');
    });
  });
});
