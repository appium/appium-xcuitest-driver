import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import B from 'bluebird';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { util } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - element(s)', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async function () {
    await deleteSession();
  });

  describe('text', function () {
    it('should get the text of an element', async function () {
      let el = await driver.elementByAccessibilityId('Buttons');
      let text = await el.text();
      text.should.eql('Buttons');
    });
    it('should not mix up elements', async function () {
      let el1 = await driver.elementByAccessibilityId('Buttons');
      let text1 = await el1.text();
      text1.should.eql('Buttons');

      let el2 = await driver.elementByAccessibilityId('Image View');
      let text2 = await el2.text();
      text2.should.eql('Image View');
    });
  });

  describe('name', function () {
    it('should get the name of an element', async function () {
      let el = await driver.elementByAccessibilityId('Buttons');
      let name = await el.getTagName();
      name.should.eql('XCUIElementTypeStaticText');
    });
  });

  describe('displayed', function () {
    it('should get the displayed status for a displayed element', async function () {
      let el = await driver.elementByAccessibilityId('Buttons');
      let displayed = await el.isDisplayed();
      displayed.should.be.true;
    });
    it('should get the displayed status for an undisplayed element', async function () {
      let el = await driver.elementByAccessibilityId('Web View');
      let displayed = await el.isDisplayed();
      displayed.should.be.false;
    });
  });

  describe('location', function () {
    it('should get the location of an element', async function () {
      let el = await driver.elementByAccessibilityId('Buttons');
      let loc = await el.getLocation();
      loc.x.should.exist;
      loc.y.should.exist;
    });
    it('should not mix up locations', async function () {
      let el1 = await driver.elementByAccessibilityId('Date Picker');
      let loc1 = await el1.getLocation();

      let el2 = await driver.elementByAccessibilityId('Image View');
      let loc2 = await el2.getLocation();

      loc1.x.should.eql(loc2.x);
      loc1.y.should.be.below(loc2.y);
    });
  });

  describe('location_in_view', function () {
    it('should get the location of an element', async function () {
      let el = await driver.elementByAccessibilityId('Buttons');
      let loc = await el.getLocation();
      loc.x.should.exist;
      loc.y.should.exist;
    });
    it('should not mix up locations', async function () {
      let el1 = await driver.elementByAccessibilityId('Date Picker');
      let loc1 = await el1.getLocation();

      let el2 = await driver.elementByAccessibilityId('Image View');
      let loc2 = await el2.getLocation();

      loc1.x.should.eql(loc2.x);
      loc1.y.should.be.below(loc2.y);
    });
  });

  describe('size', function () {
    it('should get the size of the element', async function () {
      let el = await driver.elementByAccessibilityId('Buttons');
      let size = await el.getSize();
      size.width.should.exist;
      size.height.should.exist;
    });
  });

  describe('contentSize', function () {
    it('should get the contentSize of a table', async function () {
      if (util.compareVersions(UICATALOG_CAPS.platformVersion, '>=', '13.0')) {
        return this.skip();
      }
      let table = await driver.elementByClassName('XCUIElementTypeTable');
      let contentSize = JSON.parse(await table.getAttribute('contentSize'));
      contentSize.width.should.be.a('number');
      contentSize.height.should.be.a('number');
      contentSize.top.should.be.a('number');
      contentSize.left.should.be.a('number');
      contentSize.scrollableOffset.should.be.a('number');
      contentSize.height.should.be.above(500);
      // basically, the height of the inner content should be at least 200
      // pixels more than the height of the container
      contentSize.scrollableOffset.should.be.above(contentSize.height + 200);
    });

    it.skip('should get the contentSize of a collection view', async function () {
      // TODO UICatalog doesn't seem to have collection views I could find
    });

    it('should not get the contentSize of other kinds of elements', async function () {
      let wrongTypeEl;
      try {
        wrongTypeEl = await driver.elementByAccessibilityId('UICatalog');
      } catch (ign) {
        wrongTypeEl = await driver.elementByAccessibilityId('UIKitCatalog');
      }
      await wrongTypeEl.getAttribute('contentSize').should.eventually
        .be.rejectedWith(/Can't get content size for type/);
    });
  });

  describe('touch click', function () {
    it('should click an element', async function () {
      await retryInterval(10, 500, async function () {
        let el = await driver.elementByAccessibilityId('Buttons');
        await el.tap();
        await B.delay(1000);
        (await driver.elementsByClassName('XCUIElementTypeButton')).should.have.length.above(4);
        await driver.back();
      });
    });
  });

  describe('interactions', function () {
    this.retries(2);

    describe('text fields', function () {
      let text1 = 'bunchoftext';
      let text2 = 'differenttext';
      let text3 = 'http://appium.io/';
      let secureText = _.map(new Array(text1.length), () => '•').join('');
      let phText = 'Placeholder text';

      beforeEach(async function () {
        const el = await retryInterval(10, 500, async function () {
          return await driver.elementByAccessibilityId('Text Fields');
        });
        await driver.execute('mobile: scroll', {element: el, toVisible: true});
        await el.click();
      });
      afterEach(async function () {
        await driver.back();
      });

      describe('set value', function () {
        it('should type in the text field', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.type(text1);

          let text = await el.text();
          text.should.eql(text1);
        });
        it('should type in the text field even before the keyboard is up', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.type(text1);

          let text = await el.text();
          text.should.eql(text1);
        });
        it('should type a url in the text field', async function () {
          // in Travis this sometimes gets the wrong text
          let retries = process.env.CI ? 5 : 1;
          await retryInterval(retries, 100, async () => {
            let el = await driver.elementByClassName('XCUIElementTypeTextField');
            await el.clear();
            await el.type(text3);

            let text = await el.text();
            text.should.eql(text3);
          });
        });
        it('should be able to type into two text fields', async function () {
          let els = await driver.elementsByClassName('XCUIElementTypeTextField');
          await els[0].type(text1);

          await driver.hideKeyboard();

          await els[1].type(text2);

          let text = await els[0].text();
          text.should.eql(text1);

          text = await els[1].text();
          text.should.eql(text2);
        });
        it('should type in a secure text field', async function () {
          let els = await driver.elementsByClassName('XCUIElementTypeSecureTextField');
          await els[0].type(text1);

          let text = await els[0].text();
          text.should.not.eql(text1);
          text.length.should.eql(text1.length);
          text.should.eql(secureText);
        });
        it('should type a backspace', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');

          await driver.type(el, ['0123456789\uE003']);

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a delete', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');

          await driver.type(el, ['0123456789\ue017']);

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a newline', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');

          await driver.type(el, ['0123456789\uE006']);

          let text = await el.text();
          text.should.eql('0123456789');
        });
      });

      describe('clear', function () {
        it('should clear a text field', async function () {
          let text1 = '0123456789abcdefghijklmnopqrstuvwxyz';
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.type(text1);

          let text = await el.text();
          text.should.eql(text1);

          await el.clear();

          text = await el.text();
          text.should.eql(phText);
        });
        it('should be able to clear two text fields', async function () {
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
        it('should clear a secure text field', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeSecureTextField');
          await el.type(text1);

          let text = await el.text();
          text.should.eql(secureText);

          await el.clear();
          text = await el.text();
          text.should.eql(phText);
        });
      });
      describe('keys', function () {
        it('should be able to send text to the active element', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('this is a test');
        });
        it('should type a backspace', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('0123456789\uE003');

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a delete', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('0123456789\ue017');

          let text = await el.text();
          text.should.eql('012345678');
        });
        it('should type a newline', async function () {
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          await driver.keys('0123456789\uE006');

          let text = await el.text();
          text.should.eql('0123456789');
        });
      });
      describe('hide keyboard', function () {
        it('should be able to hide the keyboard', async function () {
          // pause for a second, or else some systems will falsely fail on this test
          await B.delay(1000);
          let el = await driver.elementByClassName('XCUIElementTypeTextField');
          await el.click();

          // pause to make sure the keyboard comes up
          await B.delay(500);

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
    describe('picker wheel', function () {
      it('should be able to set the value', async function () {
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
