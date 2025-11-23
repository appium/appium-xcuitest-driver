import {PREDICATE_SEARCH} from '../helpers/element';
import {MOCHA_TIMEOUT, initSession, deleteSession} from '../helpers/session';
import {SETTINGS_CAPS, amendCapabilities} from '../desired';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('Accessibility', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver, caps;

  beforeEach(function () {
    caps = SETTINGS_CAPS;
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

  async function showAccessibilityTab(driver: any) {
    await driver
      .$(`${PREDICATE_SEARCH}:name == 'Accessibility'`)
      .click();
  }

  describe('ReduceMotion', function () {
    async function getReduceMotion(driver: any) {
      await showAccessibilityTab(driver);
      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name IN {'Reduce Motion', 'REDUCE_MOTION'}`)
        .getAttribute('value');
    }

    it('should enable reduce motion', async function () {
      caps = amendCapabilities(caps, {'appium:reduceMotion': true});
      driver = await initSession(caps);
      await expect(getReduceMotion(driver)).to.eventually.eql('1');
    });
    it('should disable reduce motion', async function () {
      caps = amendCapabilities(caps, {'appium:reduceMotion': false});
      driver = await initSession(caps);
      await expect(getReduceMotion(driver)).to.eventually.eql('0');
    });
  });

  describe('ReduceTransparency', function () {
    async function getReduceTransparency(driver: any) {
      await showAccessibilityTab(driver);
      await driver
        .$(
          `${PREDICATE_SEARCH}:name IN {'Display & Text Size', 'DISPLAY_AND_TEXT'}`,
        )
        .click();

      return await driver
        .$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeSwitch' AND name IN {'Reduce Transparency', 'REDUCE_TRANSPARENCY'}`)
        .getAttribute('value');
    }

    it('should enable reduce transparency', async function () {
      caps = amendCapabilities(caps, {'appium:reduceTransparency': true});
      driver = await initSession(caps);
      await expect(getReduceTransparency(driver)).to.eventually.eql('1');
    });
    it('should disable reduce transparency', async function () {
      caps = amendCapabilities(caps, {'appium:reduceTransparency': false});
      driver = await initSession(caps);
      await expect(getReduceTransparency(driver)).to.eventually.eql('0');
    });
  });
});

