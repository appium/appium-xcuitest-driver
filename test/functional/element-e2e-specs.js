import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { UICATALOG_CAPS } from './desired';
import { clickButton } from './helpers/navigation';
import { initSession, deleteSession } from './helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - element(s)', function () {
  this.timeout(200 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(deleteSession);

  describe('text', () => {
    it('should get the text of an element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      let text = await el.text();
      text.should.eql('Buttons');
    });
    it('should not mix up elements', async () => {
      let el1 = await driver.elementByAccessibilityId('Buttons');
      let text1 = await el1.text();
      text1.should.eql('Buttons');

      let el2 = await driver.elementByAccessibilityId('Image View');
      let text2 = await el2.text();
      text2.should.eql('Image View');
    });
  });

  describe('name', () => {
    it('should get the name of an element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      let name = await el.getTagName();
      name.should.eql('XCUIElementTypeStaticText');
    });
  });

  describe('displayed', () => {
    it('should get the displayed status for a displayed element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      let displayed = await el.isDisplayed();
      displayed.should.be.true;
    });
    it('should get the displayed status for an undisplayed element', async () => {
      let el = await driver.elementByAccessibilityId('Toolbars');
      let displayed = await el.isDisplayed();
      displayed.should.be.false;
    });
  });

  describe('location', () => {
    it('should get the location of an element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      let loc = await el.getLocation();
      loc.x.should.exist;
      loc.y.should.exist;
    });
    it('should not mix up locations', async () => {
      let el1 = await driver.elementByAccessibilityId('Buttons');
      let loc1 = await el1.getLocation();

      let el2 = await driver.elementByAccessibilityId('Image View');
      let loc2 = await el2.getLocation();

      loc1.x.should.eql(loc2.x);
      loc1.y.should.be.below(loc2.y);
    });
  });

  describe('location_in_view', () => {
    it('should get the location of an element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      let loc = await el.getLocation();
      loc.x.should.exist;
      loc.y.should.exist;
    });
    it('should not mix up locations', async () => {
      let el1 = await driver.elementByAccessibilityId('Buttons');
      let loc1 = await el1.getLocation();

      let el2 = await driver.elementByAccessibilityId('Image View');
      let loc2 = await el2.getLocation();

      loc1.x.should.eql(loc2.x);
      loc1.y.should.be.below(loc2.y);
    });
  });

  describe('size', () => {
    it('should get the size of the element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      let size = await el.getSize();
      size.width.should.exist;
      size.height.should.exist;
    });
  });

  // TODO: investigate why these break on Travis. 
  describe.skip('interactions', () => {
    let text1 = 'bunchoftext';
    let text2 = 'differenttext';
    let secureText = _.map(new Array(text1.length), () => '•').join('');
    let phText = 'Placeholder text';

    beforeEach(async () => {
      let el = await driver.elementByAccessibilityId('Text Fields');
      await driver.execute('mobile: scroll', {element: el, toVisible: true});
      await el.click();
    });
    afterEach(async () => {
      await clickButton(driver, 'UICatalog');
    });

    describe('set value', () => {
      it('should type in the text field', async () => {
        let el = await driver.elementByClassName('XCUIElementTypeTextField');
        await el.type(text1);

        let text = await el.text();
        text.should.eql(text1);
      });
      it('should be able to type into two text fields', async () => {
        let els = await driver.elementsByClassName('XCUIElementTypeTextField');
        await els[0].type(text1);

        let text = await els[0].text();
        text.should.eql(text1);

        await els[1].type(text2);

        text = await els[1].text();
        text.should.eql(text2);
      });
      it('should type in a secure text field', async () => {
        let els = await driver.elementsByClassName('XCUIElementTypeSecureTextField');
        await els[0].type(text1);

        let text = await els[0].text();
        text.should.not.eql(text1);
        text.length.should.eql(text1.length);
        text.should.eql(secureText);
      });
    });

    describe('clear', () => {
      it('should clear a text field', async () => {
        let el = await driver.elementByClassName('XCUIElementTypeTextField');
        await el.type(text1);

        let text = await el.text();
        text.should.eql(text1);

        await el.clear();

        text = await el.text();
        text.should.eql(phText);
      });
      it('should be able to clear two text fields', async () => {
        let els = await driver.elementsByClassName('XCUIElementTypeTextField');
        await els[0].type(text1);

        let text = await els[0].text();
        text.should.eql(text1);

        await els[1].type(text2);

        text = await els[1].text();
        text.should.eql(text2);

        await els[0].clear();

        text = await els[0].text();
        text.should.eql(phText);

        await els[1].clear();

        text = await els[1].text();
        text.should.eql(phText);
      });
      it('should clear a secure text field', async () => {
        let el = await driver.elementByClassName('XCUIElementTypeSecureTextField');
        await el.type(text1);

        let text = await el.text();
        text.should.eql(secureText);

        await el.clear();
        text = await el.text();
        text.should.eql(phText);
      });
    });
  });
});
