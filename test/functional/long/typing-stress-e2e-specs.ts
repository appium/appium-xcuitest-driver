import {getUICatalogCaps, amendCapabilities} from '../desired';
import {PREDICATE_SEARCH} from '../helpers/element';
import {initSession, deleteSession} from '../helpers/session';
import {retryInterval} from 'asyncbox';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

// leave the long test to Travis
const TYPING_TRIES = process.env.CI ? 100 : 10;

describe('XCUITestDriver - long tests', function () {
  this.timeout(0);

  let driver;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    const caps = amendCapabilities(uiCatalogCaps, {'appium:maxTypingFrequency': 20});
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('typing', function () {
    const text = 'bunchoftext';
    before(async function () {
      const tfEl = await driver.$('~Text Fields');
      await driver.execute('mobile: scroll', {element: tfEl, toVisible: true});
      await tfEl.click();

      // wait for there to be text fields present
      await retryInterval(5, 500, async function () {
        const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeTextField'`);
        await el.clearValue();
      });
    });

    afterEach(async function () {
      const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeTextField'`);
      await el.clearValue();
    });

    for (let i = 0; i < TYPING_TRIES; i++) {
      it(`should not fail in typing (try #${i + 1})`, async function () {
        const el = await driver.$(`${PREDICATE_SEARCH}:type == 'XCUIElementTypeTextField'`);
        await el.setValue(text);
        await expect(el.getValue()).to.eventually.include(text);
      });
    }
  });
});
