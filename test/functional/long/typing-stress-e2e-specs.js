import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';
import { retryInterval } from 'asyncbox';


chai.should();
chai.use(chaiAsPromised);

// leave the long test to Travis
const TYPING_TRIES = process.env.CI ? 100 : 10;

describe('XCUITestDriver - long tests', function () {
  this.timeout(0);

  let driver;
  before(async function () {
    const caps = Object.assign({}, UICATALOG_CAPS, {maxTypingFrequency: 20});
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('typing', function () {
    const text = 'bunchoftext';
    before(async function () {
      const tfEl = await driver.elementByAccessibilityId('Text Fields');
      await driver.execute('mobile: scroll', {element: tfEl, toVisible: true});
      await tfEl.click();

      // wait for there to be text fields present
      await retryInterval(5, 500, async function () {
        await driver.elementByClassName('XCUIElementTypeTextField').clear();
      });
    });

    afterEach(async function () {
      await driver.elementByClassName('XCUIElementTypeTextField').clear();
    });

    for (let i = 0; i < TYPING_TRIES; i++) {
      it(`should not fail in typing (try #${i + 1})`, async function () {
        const el = await driver.elementByClassName('XCUIElementTypeTextField');
        await el.type(text);

        (await el.text()).should.include(text);
      });
    }
  });
});
