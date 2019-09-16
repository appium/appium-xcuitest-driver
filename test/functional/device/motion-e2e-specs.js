import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { MOCHA_TIMEOUT, initSession, deleteSession } from '../helpers/session';
import { SETTINGS_CAPS } from '../desired';


const PREDICATE_SEARCH = '-ios predicate string';

chai.should();
chai.use(chaiAsPromised);

describe('ReduceMotion', function () {
  this.timeout(MOCHA_TIMEOUT);

  let caps = Object.assign({usePrebuiltWDA: true}, SETTINGS_CAPS);

  let driver;

  afterEach(async function () {
    // try to get rid of the driver, so if a test fails the rest of the
    // tests aren't compromised
    await deleteSession();
  });

  async function getReduceMotion (driver) {
    let motionButtonCalledMotion = false;
    try {
      // iOS 13 has Accessbility outside the General tab
      await driver
        .element(PREDICATE_SEARCH, "type == 'XCUIElementTypeCell' AND name == 'Accessibility'")
        .click();
      motionButtonCalledMotion = true;
    } catch (err) {
      await driver
        .element(PREDICATE_SEARCH, "type == 'XCUIElementTypeCell' AND name == 'General'")
        .click();
      await driver
        .element(PREDICATE_SEARCH, "type == 'XCUIElementTypeCell' AND name == 'Accessibility'")
        .click();
    }
    await driver
      .element(PREDICATE_SEARCH, `type == 'XCUIElementTypeCell' AND name == '${motionButtonCalledMotion ? 'Motion' : 'Reduce Motion'}'`)
      .click();
    return await driver
      .element(PREDICATE_SEARCH, "type == 'XCUIElementTypeSwitch' AND name == 'Reduce Motion'")
      .getAttribute('value');
  }

  if (!process.env.REAL_DEVICE) {
    it('should enable reduce motion', async function () {
      caps.reduceMotion = true;
      driver = await initSession(caps);
      (await getReduceMotion(driver)).should.eql('1');
    });
    it('should disable reduce motion', async function () {
      caps.reduceMotion = false;
      driver = await initSession(caps);
      (await getReduceMotion(driver)).should.eql('0');
    });
  }
});
