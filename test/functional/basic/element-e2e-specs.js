import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - element(s)', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async () => {
    await deleteSession();
  });

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

  describe('touch click', () => {
    it('should click an element', async () => {
      let el = await driver.elementByAccessibilityId('Buttons');
      await el.tap();
      (await driver.elementsByClassName('XCUIElementTypeButton')).should.have.length.above(4);

      await driver.back();
    });
  });

  describe('interactions', function () {
    describe('text fields', () => {
      let text1 = 'bunchoftext';
      let text2 = 'differenttext';
      let text3 = 'http://appium.io/';
      let secureText = _.map(new Array(text1.length), () => '•').join('');
      let phText = 'Placeholder text';

      beforeEach(async function () {
        let el = await driver.elementByAccessibilityId('Text Fields');
        await driver.execute('mobile: scroll', {element: el, toVisible: true});
        await el.click();
      });
      afterEach(async () => {
        await driver.back();
      });

      describe('set value', () => {
        it('should type in the text field', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.type(text1);

          let text = await el.text();
          text.should.eql(text1);
        });
        it('should type in the text field even before the keyboard is up', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.type(text1);

          let text = await el.text();
          text.should.eql(text1);
        });
        it('should type a url in the text field', async () => {
          // in Travis this sometimes gets the wrong text
          let retries = process.env.TRAVIS ? 5 : 1;
          await retryInterval(retries, 100, async () => {
            let el = await driver.elementByClassName('XCUIElementTypeTextField');
            await el.clear();
            await el.type(text3);

            let text = await el.text();
            text.should.eql(text3);
          });
        });
        it('should be able to type into two text fields', async () => {
          let els = await driver.elementsByClassName('XCUIElementTypeTextField');
          await els[0].type(text1);

          await driver.hideKeyboard();

          await els[1].type(text2);

          let text = await els[0].text();
          text.should.eql(text1);

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
        it('should type a backspace', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');

          await driver.type(el, ['0123456789\uE003']);

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a delete', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');

          await driver.type(el, ['0123456789\ue017']);

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a newline', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');

          await driver.type(el, ['0123456789\uE006']);

          let text = await el.text();
          text.should.eql('0123456789');
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

          await driver.hideKeyboard();

          await els[1].type(text2);

          text = await els[1].text();
          text.should.eql(text2);

          await els[0].clear();

          text = await els[0].text();
          text.should.eql(phText);

          await driver.hideKeyboard();

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
      describe('keys', () => {
        it('should be able to send text to the active element', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('this is a test');
        });
        it('should type a backspace', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('0123456789\uE003');

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a delete', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('0123456789\ue017');

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a newline', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('0123456789\uE006');

          let text = await el.text();
          text.should.eql('0123456789');
        });
      });
      describe('hide keyboard', () => {
        it('should be able to hide the keyboard', async () => {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.click();

          let db = await driver.elementByAccessibilityId('Done');
          (await db.isDisplayed()).should.be.true;

          await driver.hideKeyboard();

          // pause for a second to allow keyboard to go out of view
          // otherwise slow systems will reject the search for `Done` and
          // fast ones will get the element but it will be invisible
          await B.delay(1000);

          db = await driver.elementByAccessibilityId('Done').should.eventually.be.rejected;
        });
      });
    });
    describe('picker wheel', () => {
      it('should be able to set the value', async () => {
        let el = await driver.elementByAccessibilityId('Picker View');
        await el.click();

        let wheels = await driver.elementsByClassName('XCUIElementTypePickerWheel');

        let values = [65, 205, 120];
        for (let i = 0; i < 3; i++) {
          let wheel = wheels[i];

          let value = await wheel.getAttribute('value');
          parseInt(value, 10).should.eql(values[i]);

          await wheel.type(150);

          value = await wheel.getAttribute('value');
          parseInt(value, 10).should.eql(150);
        }
      });
    });
  });
});
