import _ from 'lodash';
import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {extractCapabilityValue, getUICatalogCaps} from '../desired';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {util} from 'appium/support';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('XCUITestDriver - elements -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('text', function () {
    it('should get the text of an element', async function () {
      const el = await driver.$('~Buttons');
      const text = await el.getText();
      expect(text).to.eql('Buttons');
    });
    it('should not mix up elements', async function () {
      const el1 = await driver.$('~Buttons');
      const text1 = await el1.getText();
      expect(text1).to.eql('Buttons');

      const el2 = await driver.$('~Image View');
      const text2 = await el2.getText();
      expect(text2).to.eql('Image View');
    });
  });

  describe('name', function () {
    it('should get the name of an element', async function () {
      const el = await driver.$('~Buttons');
      const name = await el.getTagName();
      expect(name).to.eql('XCUIElementTypeStaticText');
    });
  });

  describe('displayed', function () {
    it('should get the displayed status for a displayed element', async function () {
      const el = await driver.$('~Buttons');
      expect(await el.isDisplayed()).to.be.true;
    });
    it('should get the displayed status for an undisplayed element', async function () {
      // this value is invisible in the view
      const el = await driver.$('~Horizontal scroll bar, 1 page');
      expect(await el.isDisplayed()).to.be.false;
    });
  });

  describe('location', function () {
    it('should get the location of an element', async function () {
      const el = await driver.$('~Buttons');
      const loc = await el.getLocation();
      expect(loc.x).to.exist;
      expect(loc.y).to.exist;
    });
    it('should not mix up locations', async function () {
      const el1 = await driver.$('~Date Picker');
      const loc1 = await el1.getLocation();

      const el2 = await driver.$('~Image View');
      const loc2 = await el2.getLocation();

      expect(loc1.x).to.eql(loc2.x);
      expect(loc1.y).to.be.below(loc2.y);
    });
  });

  describe('location_in_view', function () {
    it('should get the location of an element', async function () {
      const el = await driver.$('~Buttons');
      const loc = await el.getLocation();
      expect(loc.x).to.exist;
      expect(loc.y).to.exist;
    });
    it('should not mix up locations', async function () {
      const el1 = await driver.$('~Date Picker');
      const loc1 = await el1.getLocation();

      const el2 = await driver.$('~Image View');
      const loc2 = await el2.getLocation();

      expect(loc1.x).to.eql(loc2.x);
      expect(loc1.y).to.be.below(loc2.y);
    });
  });

  describe('size', function () {
    it('should get the size of the element', async function () {
      const el = await driver.$('~Buttons');
      const size = await el.getSize();
      expect(size.width).to.exist;
      expect(size.height).to.exist;
    });
  });

  describe('contentSize', function () {
    it('should get the contentSize of a table', async function () {
      const uiCatalogCaps = await getUICatalogCaps();
      if (
        util.compareVersions(
          extractCapabilityValue(uiCatalogCaps, 'appium:platformVersion'),
          '>=',
          '13.0',
        )
      ) {
        return this.skip();
      }
      const table = await driver.$('XCUIElementTypeTable');
      const contentSize = JSON.parse(await table.getAttribute('contentSize'));
      expect(contentSize.width).to.be.a('number');
      expect(contentSize.height).to.be.a('number');
      expect(contentSize.top).to.be.a('number');
      expect(contentSize.left).to.be.a('number');
      expect(contentSize.scrollableOffset).to.be.a('number');
      expect(contentSize.height).to.be.above(500);
      // basically, the height of the inner content should be at least 200
      // pixels more than the height of the container
      expect(contentSize.scrollableOffset).to.be.above(contentSize.height + 200);
    });

    it.skip('should get the contentSize of a collection view', async function () {
      // TODO UICatalog doesn't seem to have collection views I could find
    });

    it('should not get the contentSize of other kinds of elements', async function () {
      let wrongTypeEl = await driver.$('~UIKitCatalog');
      if (wrongTypeEl.error) {
        wrongTypeEl = await driver.$('~UICatalog');
      }
      await expect(wrongTypeEl.getAttribute('contentSize')).to.eventually.be.rejectedWith(
        /Can't get content size for type/,
      );
    });
  });

  describe('touch click', function () {
    it('should click an element', async function () {
      await retryInterval(10, 500, async function () {
        const el = await driver.$('~Buttons');
        await el.click();
        await B.delay(1000);
        expect(await driver.$$('XCUIElementTypeButton')).to.have.length.above(4);
        await driver.back();
      });
    });
  });

  describe('interactions', function () {
    this.retries(2);

    describe('text fields', function () {
      const text1 = 'bunchoftext';
      const text2 = 'differenttext';
      const text3 = 'http://appium.io/';
      const secureText = _.map(new Array(text1.length), () => '•').join('');
      const phText = 'Placeholder text';

      beforeEach(async function () {
        const el = await retryInterval(10, 500, async function () {
          return await driver.$('~Text Fields');
        });
        await driver.execute('mobile: scroll', {element: el.elementId, toVisible: true});
        await el.click();
      });
      afterEach(async function () {
        await driver.back();
      });

      describe('set value', function () {
        it('should type in the text field', async function () {
          const el = await driver.$('XCUIElementTypeTextField');
          await el.setValue(text1);

          const text = await el.getText();
          expect(text).to.eql(text1);
        });
        it('should type in the text field even before the keyboard is up', async function () {
          const el = await driver.$('XCUIElementTypeTextField');
          await el.setValue(text1);

          const text = await el.getText();
          expect(text).to.eql(text1);
        });
        it('should type a url in the text field', async function () {
          // in Travis this sometimes gets the wrong text
          const retries = process.env.CI ? 5 : 1;
          await retryInterval(retries, 100, async () => {
            const el = await driver.$('XCUIElementTypeTextField');
            await el.clearValue();
            await el.setValue(text3);

            const text = await el.getText();
            expect(text).to.eql(text3);
          });
        });
        it('should be able to type into two text fields', async function () {
          const els = await driver.$$('XCUIElementTypeTextField');
          await els[0].setValue(text1);

          await driver.hideKeyboard();

          await els[1].setValue(text2);

          let text = await els[0].getText();
          expect(text).to.eql(text1);

          text = await els[1].getText();
          expect(text).to.eql(text2);
        });
        it('should type in a secure text field', async function () {
          const els = await driver.$$('XCUIElementTypeSecureTextField');
          await els[0].setValue(text1);

          const text = await els[0].getText();
          expect(text).to.not.eql(text1);
          expect(text.length).to.eql(text1.length);
          expect(text).to.eql(secureText);
        });
        it('should type a backspace', async function () {
          const el = await driver.$('XCUIElementTypeTextField');

          await driver.elementSendKeys(el.elementId, '0123456789\uE003');

          const text = await el.getText();
          expect(text).to.eql('012345678');
        });
        it('should type a delete', async function () {
          const el = await driver.$('XCUIElementTypeTextField');

          await driver.elementSendKeys(el.elementId, '0123456789\ue017');

          const text = await el.getText();
          expect(text).to.eql('012345678');
        });
        it('should type a newline', async function () {
          const el = await driver.$('XCUIElementTypeTextField');

          await driver.elementSendKeys(el.elementId, '0123456789\uE006');

          const text = await el.getText();
          expect(text).to.eql('0123456789');
        });
      });

      describe('clear', function () {
        it('should clear a text field', async function () {
          const text1 = '0123456789abcdefghijklmnopqrstuvwxyz';
          const el = await driver.$('XCUIElementTypeTextField');
          await el.setValue(text1);

          let text = await el.getText();
          expect(text).to.eql(text1);

          await el.clearValue();

          text = await el.getText();
          expect(text).to.eql(phText);
        });
        it('should be able to clear two text fields', async function () {
          const els = await driver.$$('XCUIElementTypeTextField');
          await els[0].setValue(text1);

          let text = await els[0].getText();
          expect(text).to.eql(text1);

          await driver.hideKeyboard();

          await els[1].setValue(text2);

          text = await els[1].getText();
          expect(text).to.eql(text2);

          await els[0].clearValue();

          text = await els[0].getText();
          expect(text).to.eql(phText);

          await driver.hideKeyboard();

          await els[1].clearValue();

          text = await els[1].getText();
          expect(text).to.eql(phText);
        });
        it('should clear a secure text field', async function () {
          const el = await driver.$('XCUIElementTypeSecureTextField');
          await el.setValue(text1);

          let text = await el.getText();
          expect(text).to.eql(secureText);

          await el.clearValue();
          text = await el.getText();
          expect(text).to.eql(phText);
        });
      });
      describe('key', function () {
        it('should be able to send text to the active element', async function () {
          const el = await driver.$('XCUIElementTypeTextField');
          // make sure the keyboard is up
          await el.click();

          const actions = [
            // Selenium clients generate below code for `driver.action.send_keys('a').perform`.
            {
              type: 'pointer',
              id: 'touch',
              actions: [
                {type: 'pause', duration: 0},
                {type: 'pause', duration: 0},
                {type: 'pause', duration: 0},
                {type: 'pause', duration: 0},
                {type: 'pause', duration: 0},
                {type: 'pause', duration: 0},
              ],
            },
            {
              type: 'key',
              id: 'keyboard',
              actions: [
                {type: 'keyDown', value: 'h'},
                {type: 'keyUp', value: 'h'},
                {type: 'keyDown', value: 'i'},
                {type: 'keyUp', value: 'i'},
                {type: 'keyDown', value: 'あ'},
                {type: 'keyUp', value: 'あ'},
              ],
            },
          ];
          await driver.performActions(actions);

          const text = await el.getText();
          expect(text).to.eql('hiあ');
        });
      });
      describe('hide keyboard', function () {
        it('should pass if the keyboard is already hidden', async function () {
          await expect(driver.hideKeyboard()).to.be.fulfilled;
        });
      });
    });

    describe('picker wheel', function () {
      beforeEach(async function () {
        const el = await driver.$('~Picker View');
        await el.click();
      });

      afterEach(async function () {
        await driver.back();
      });

      it('should be able to set the value', async function () {
        const wheels = await driver.$$('XCUIElementTypePickerWheel');

        const values = [65, 205, 120];
        for (let i = 0; i < 3; i++) {
          const wheel = wheels[i];

          let value = await wheel.getAttribute('value');
          expect(parseInt(value, 10)).to.eql(values[i]);

          await wheel.setValue(150);

          value = await wheel.getAttribute('value');
          expect(parseInt(value, 10)).to.eql(150);
        }
      });
    });
  });
});
