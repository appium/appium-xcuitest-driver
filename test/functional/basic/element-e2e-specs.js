import _ from 'lodash';
import B from 'bluebird';
import {retryInterval} from 'asyncbox';
import {extractCapabilityValue, amendCapabilities, UICATALOG_CAPS} from '../desired';
import {initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT} from '../helpers/session';
import {util} from 'appium/support';


describe('XCUITestDriver - elements -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  let chai;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    const caps = amendCapabilities(UICATALOG_CAPS, {
      'appium:usePrebuiltWDA': hasDefaultPrebuiltWDA(),
    });
    driver = await initSession(caps);
  });
  after(async function () {
    await deleteSession();
  });

  describe('text', function () {
    it('should get the text of an element', async function () {
      let el = await driver.$('~Buttons');
      let text = await el.getText();
      text.should.eql('Buttons');
    });
    it('should not mix up elements', async function () {
      let el1 = await driver.$('~Buttons');
      let text1 = await el1.getText();
      text1.should.eql('Buttons');

      let el2 = await driver.$('~Image View');
      let text2 = await el2.getText();
      text2.should.eql('Image View');
    });
  });

  describe('name', function () {
    it('should get the name of an element', async function () {
      let el = await driver.$('~Buttons');
      let name = await el.getTagName();
      name.should.eql('XCUIElementTypeStaticText');
    });
  });

  describe('displayed', function () {
    it('should get the displayed status for a displayed element', async function () {
      let el = await driver.$('~Buttons');
      (await el.isDisplayed()).should.be.true;
    });
  });

  describe('location', function () {
    it('should get the location of an element', async function () {
      let el = await driver.$('~Buttons');
      let loc = await el.getLocation();
      loc.x.should.exist;
      loc.y.should.exist;
    });
    it('should not mix up locations', async function () {
      let el1 = await driver.$('~Date Picker');
      let loc1 = await el1.getLocation();

      let el2 = await driver.$('~Image View');
      let loc2 = await el2.getLocation();

      loc1.x.should.eql(loc2.x);
      loc1.y.should.be.below(loc2.y);
    });
  });

  describe('location_in_view', function () {
    it('should get the location of an element', async function () {
      let el = await driver.$('~Buttons');
      let loc = await el.getLocation();
      loc.x.should.exist;
      loc.y.should.exist;
    });
    it('should not mix up locations', async function () {
      let el1 = await driver.$('~Date Picker');
      let loc1 = await el1.getLocation();

      let el2 = await driver.$('~Image View');
      let loc2 = await el2.getLocation();

      loc1.x.should.eql(loc2.x);
      loc1.y.should.be.below(loc2.y);
    });
  });

  describe('size', function () {
    it('should get the size of the element', async function () {
      let el = await driver.$('~Buttons');
      let size = await el.getSize();
      size.width.should.exist;
      size.height.should.exist;
    });
  });

  describe('contentSize', function () {
    it('should get the contentSize of a table', async function () {
      if (
        util.compareVersions(
          extractCapabilityValue(UICATALOG_CAPS, 'appium:platformVersion'),
          '>=',
          '13.0',
        )
      ) {
        return this.skip();
      }
      let table = await driver.$('XCUIElementTypeTable');
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
      let wrongTypeEl = await driver.$('~UIKitCatalog');
      if (wrongTypeEl.error) {
        wrongTypeEl = await driver.$('~UICatalog');
      }
      await wrongTypeEl
        .getAttribute('contentSize')
        .should.eventually.be.rejectedWith(/Can't get content size for type/);
    });
  });

  describe('touch click', function () {
    it('should click an element', async function () {
      await retryInterval(10, 500, async function () {
        let el = await driver.$('~Buttons');
        await el.click();
        await B.delay(1000);
        (await driver.$$('XCUIElementTypeButton')).should.have.length.above(4);
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
          let el = await driver.$('XCUIElementTypeTextField');
          await el.setValue(text1);

          let text = await el.getText();
          text.should.eql(text1);
        });
        it('should type in the text field even before the keyboard is up', async function () {
          let el = await driver.$('XCUIElementTypeTextField');
          await el.setValue(text1);

          let text = await el.getText();
          text.should.eql(text1);
        });
        it('should type a url in the text field', async function () {
          // in Travis this sometimes gets the wrong text
          let retries = process.env.CI ? 5 : 1;
          await retryInterval(retries, 100, async () => {
            let el = await driver.$('XCUIElementTypeTextField');
            await el.clearValue();
            await el.setValue(text3);

            let text = await el.getText();
            text.should.eql(text3);
          });
        });
        it('should be able to type into two text fields', async function () {
          let els = await driver.$$('XCUIElementTypeTextField');
          await els[0].setValue(text1);

          await driver.hideKeyboard();

          await els[1].setValue(text2);

          let text = await els[0].getText();
          text.should.eql(text1);

          text = await els[1].getText();
          text.should.eql(text2);
        });
        it('should type in a secure text field', async function () {
          let els = await driver.$$('XCUIElementTypeSecureTextField');
          await els[0].setValue(text1);

          let text = await els[0].getText();
          text.should.not.eql(text1);
          text.length.should.eql(text1.length);
          text.should.eql(secureText);
        });
        it('should type a backspace', async function () {
          let el = await driver.$('XCUIElementTypeTextField');

          await driver.elementSendKeys(el.elementId, '0123456789\uE003');

          let text = await el.getText();
          text.should.eql('012345678');
        });
        it('should type a delete', async function () {
          let el = await driver.$('XCUIElementTypeTextField');

          await driver.elementSendKeys(el.elementId, '0123456789\ue017');

          let text = await el.getText();
          text.should.eql('012345678');
        });
        it('should type a newline', async function () {
          let el = await driver.$('XCUIElementTypeTextField');

          await driver.elementSendKeys(el.elementId, '0123456789\uE006');

          let text = await el.getText();
          text.should.eql('0123456789');
        });
      });

      describe('clear', function () {
        it('should clear a text field', async function () {
          let text1 = '0123456789abcdefghijklmnopqrstuvwxyz';
          let el = await driver.$('XCUIElementTypeTextField');
          await el.setValue(text1);

          let text = await el.getText();
          text.should.eql(text1);

          await el.clearValue();

          text = await el.getText();
          text.should.eql(phText);
        });
        it('should be able to clear two text fields', async function () {
          let els = await driver.$$('XCUIElementTypeTextField');
          await els[0].setValue(text1);

          let text = await els[0].getText();
          text.should.eql(text1);

          await driver.hideKeyboard();

          await els[1].setValue(text2);

          text = await els[1].getText();
          text.should.eql(text2);

          await els[0].clearValue();

          text = await els[0].getText();
          text.should.eql(phText);

          await driver.hideKeyboard();

          await els[1].clearValue();

          text = await els[1].getText();
          text.should.eql(phText);
        });
        it('should clear a secure text field', async function () {
          let el = await driver.$('XCUIElementTypeSecureTextField');
          await el.setValue(text1);

          let text = await el.getText();
          text.should.eql(secureText);

          await el.clearValue();
          text = await el.getText();
          text.should.eql(phText);
        });
      });
      describe('key', function () {
        it('should be able to send text to the active element', async function () {
          let el = await driver.$('XCUIElementTypeTextField');
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
                {type: 'pause', duration: 0}
              ]
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

          let text = await el.getText();
          text.should.eql('hiあ');
        });
      });
      describe('hide keyboard', function () {
        it('should pass if the keyboard is already hidden', async function () {
          await driver.hideKeyboard().should.be.fulfilled;
        });
      });
    });

    describe('picker wheel', function () {
      beforeEach(async function () {
        let el = await driver.$('~Picker View');
        await el.click();
      });

      afterEach(async function () {
        await driver.back();
      });

      it('should be able to set the value', async function () {
        let wheels = await driver.$$('XCUIElementTypePickerWheel');

        let values = [65, 205, 120];
        for (let i = 0; i < 3; i++) {
          let wheel = wheels[i];

          let value = await wheel.getAttribute('value');
          parseInt(value, 10).should.eql(values[i]);

          await wheel.setValue(150);

          value = await wheel.getAttribute('value');
          parseInt(value, 10).should.eql(150);
        }
      });
    });
  });
});
