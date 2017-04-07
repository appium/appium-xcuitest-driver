import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - long tests', function () {
  this.timeout(0);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async () => {
    await deleteSession();
  });

  describe('typing', function () {
    beforeEach(async function () {
      let el = await driver.elementByAccessibilityId('Text Fields');
      await driver.execute('mobile: scroll', {element: el, toVisible: true});
      await el.click();
    });
    afterEach(async () => {
      await driver.back();
    });

    it('should not fail in typing', async () => {
      let text = 'bunchoftext';
      let el = await driver.elementByClassName('XCUIElementTypeTextField');
      for (let i = 0; i < 300; i++) {
        await el.type(text);

        (await el.text()).should.include(text);

        await el.clear();
      }
    });
  });
});
