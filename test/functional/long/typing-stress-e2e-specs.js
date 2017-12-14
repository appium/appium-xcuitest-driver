import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

// leave the long test to Travis
const TYPING_TRIES = process.env.CI ? 200 : 10;

describe('XCUITestDriver - long tests', function () {
  this.timeout(0);

  let driver;
  before(async function () {
    let caps = Object.assign({}, UICATALOG_CAPS, {maxTypingFrequency: 20});
    driver = await initSession(caps);
  });
  after(async () => {
    await deleteSession();
  });

  describe('typing', function () {
    let text = 'bunchoftext';
    let el;
    before(async function () {
      let tfEl = await driver.elementByAccessibilityId('Text Fields');
      await driver.execute('mobile: scroll', {element: tfEl, toVisible: true});
      await tfEl.click();

      // get the text field for the subsequent tests
      el = await driver.elementByClassName('XCUIElementTypeTextField');
    });

    for (let i = 0; i < TYPING_TRIES; i++) {
      it(`should not fail in typing (try #${i+1})`, async () => {

        await el.type(text);

        (await el.text()).should.include(text);

        await el.clear();
      });
    }
  });
});
