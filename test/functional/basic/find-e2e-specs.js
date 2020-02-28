import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import _ from 'lodash';
import { retryInterval } from 'asyncbox';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession, MOCHA_TIMEOUT } from '../helpers/session';
import { util } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

const TEST_PAUSE_DURATION = process.env.CLOUD ? 5000 : 500;

const PV_ABOVE_13 = util.compareVersions(UICATALOG_CAPS.platformVersion, '>=', '13.0');

// there are some differences in the apps
const FIRST_ELEMENT = PV_ABOVE_13 ? 'Activity Indicators' : 'Action Sheets';
const APP_TITLE = PV_ABOVE_13 ? 'UIKitCatalog' : 'UICatalog';

describe('XCUITestDriver - find', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;
  before(async function () {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async function () {
    await deleteSession();
  });

  // establish that the basic things work as we imagine
  describe('basics', function () {
    let el1;
    before(async function () {
      el1 = await driver.elementByAccessibilityId('Buttons');
      el1.should.exist;
    });
    it('should find an element within descendants', async function () {
      let el2 = await el1.elementByClassName('XCUIElementTypeStaticText');
      (await el2.getAttribute('name')).should.contain('Buttons');
    });

    it('should not find an element not within itself', async function () {
      await B.resolve(el1.elementByClassName('XCUIElementTypeNavigationBar'))
        .should.eventually.be.rejectedWith(/Error response status: 7/);
    });

    it.skip('should find some elements within itself', async function () {
      let els = await el1.elementsByClassName('XCUIElementTypeStaticText');
      els.should.have.length(2);
    });

    it('should not find elements not within itself', async function () {
      let els = await el1.elementsByClassName('XCUIElementTypeNavigationBar');
      els.should.have.length(0);
    });
  });

  // make sure that elements are mixed up
  describe.skip('no mix up', function () {
    after(async function () {
      await driver.back();
    });

    it('should not allow found elements to be mixed up', async function () {
      let table = await driver.elementByClassName('XCUIElementTypeTable');
      let el1 = await table.elementByClassName('XCUIElementTypeStaticText');
      let el1Name = await el1.getAttribute('name');
      await el1.click();

      // we need a hard pause, because if we haven't shifted views yet
      // we will have the previous elements, so the get command will be fulfilled.
      await B.delay(1000);

      await driver.setImplicitWaitTimeout(5000);
      table = await driver.elementByClassName('XCUIElementTypeTable');
      let el2 = await driver.elementByClassName('XCUIElementTypeStaticText');
      let el2Name = await el2.getAttribute('name');
      el1.should.not.equal(el2);
      el1Name.should.not.equal(el2Name);

      // el1 is gone, so it doesn't have a name anymore
      (await el1.getAttribute('name')).should.equal('');
    });
  });

  describe('by id', function () {
    it('should find a single element by id', async function () {
      let el = await driver.elementById('Alert Views');
      el.should.exist;
    });

    it('should find a single element by id wrapped in array for multi', async function () {
      let els = await driver.elementsById('Alert Views');
      els.should.have.length(1);
    });

    it('should first attempt to match accessibility id', async function () {
      let el = await driver.elementById('Alert Views');
      (await el.getAttribute('label')).should.equal('Alert Views');
    });

    it('should attempt to match by string if no accessibility id matches', async function () {
      let el = await driver.elementById('Alert Views');
      (await el.getAttribute('label')).should.equal('Alert Views');
    });

    it.skip('should use a localized string if the id is a localization key', async function () {
      let el = await driver.elementById('main.button.computeSum');
      (await el.getAttribute('label')).should.equal('Compute Sum');
    });

    it.skip('should be able to return multiple matches', async function () {
      let els = await driver.elementsById('Cell');
      els.length.should.be.greaterThan(1);
    });
  });

  describe('by xpath', function () {
    describe('individual calls', function () {

      before(async function () {
        // before anything, try to go back
        // otherwise the tests will fail erroneously
        await driver.back();

        // and make sure we are at the top of the page
        try {
          await driver.execute('mobile: scroll', {direction: 'up'});
        } catch (ign) {}
      });
      beforeEach(async function () {
        // go into the right page
        await retryInterval(10, 500, async () => {
          let el = await driver.elementByAccessibilityId('Buttons');
          await el.click();

          (await driver.elementsByAccessibilityId('Button')).should.have.length.at.least(1);
        });
      });
      afterEach(async function () {
        await driver.back();
      });

      it('should respect implicit wait', async function () {
        await driver.setImplicitWaitTimeout(5000);

        let begin = Date.now();
        await driver.elementByXPath('//something_not_there')
          .should.eventually.be.rejected;
        (Date.now() - begin).should.be.above(5000);
      });
      it.skip('should return the last button', async function () {
        let el = await driver.elementByXPath('//XCUIElementTypeButton[last()]');
        (await el.getAttribute('name')).should.equal('Button'); // this is the name of the last button
      });
      it('should return a single element', async function () {
        let el = await driver.elementByXPath('//XCUIElementTypeButton');
        (await el.getAttribute('name')).should.equal(APP_TITLE);
      });
      it('should return multiple elements', async function () {
        let els = await driver.elementsByXPath('//XCUIElementTypeButton');
        els.should.have.length.above(4);
      });
      it('should filter by name', async function () {
        let el = await driver.elementByXPath(`//XCUIElementTypeButton[@name='X Button']`);
        (await el.getAttribute('name')).should.equal('X Button');
      });
      it('should know how to restrict root-level elements', async function () {
        await driver.elementByXPath('/XCUIElementTypeButton')
          .should.eventually.be.rejectedWith(/NoSuchElement/);
      });
      it('should search an extended path by child', async function () {
        // pause a moment or the next command gets stuck getting the xpath :(
        await B.delay(TEST_PAUSE_DURATION);

        let el;
        try {
          el = await driver.elementByXPath('//XCUIElementTypeNavigationBar/XCUIElementTypeStaticText');
        } catch (err) {
          el = await driver.elementByXPath('//XCUIElementTypeNavigationBar/XCUIElementTypeOther');
        }
        (await el.getAttribute('name')).should.equal('Buttons');
      });
      it('should search an extended path by descendant', async function () {
        let els = await driver.elementsByXPath('//XCUIElementTypeTable//XCUIElementTypeButton');
        let texts = await B.all(_.map(els, (el) => el.getAttribute('name')));
        texts.should.not.include('UICatalog');
        texts.should.not.include('UIKitCatalog');
        texts.should.include('X Button');
      });
      it.skip('should filter by indices', async function () {
        let el = await driver.elementByXPath('//XCUIElementTypeTable[1]//XCUIElementTypeButton[4]');
        (await el.getAttribute('name')).should.equal('X Button');
      });

      it('should filter by partial text', async function () {
        let el = await driver.elementByXPath(`//XCUIElementTypeTable//XCUIElementTypeButton[contains(@name, 'X')]`);
        (await el.getAttribute('name')).should.equal('X Button');
      });
    });

    describe.skip('multiple calls', function () {
      let runs = 5;

      before(async function () {
        // go into the right page
        let el = await driver.elementByAccessibilityId('Buttons');
        await el.click();
      });
      after(async function () {
        await driver.back();
      });

      let test = function (path, minLength) {
        return function () {
          it('should not crash', async function () {
            let els = await driver.elementsByXPath(path);
            els.should.have.length.above(minLength);
          });
        };
      };

      describe.skip('finding specific path', function () {
        for (let n = 0; n < runs; n++) {
          describe(`test ${n + 1}`, test('//XCUIElementTypeApplication[0]/XCUIElementTypeWindow[0]', 17));
        }
      });

      describe('finding //*', function () {
        for (let n = 0; n < runs; n++) {
          describe(`test ${n + 1}`, test('//*', 52));
        }
      });
    });
  });

  describe('by accessibility id', function () {
    afterEach(async function () {
      await driver.back();
    });

    it('should find one element', async function () {
      let el1 = await driver.elementByAccessibilityId('Alert Views');
      await el1.click();
      let el2 = await driver.elementByAccessibilityId('Okay / Cancel');
      (await el2.getAttribute('name')).should.equal('Okay / Cancel');
    });

    it.skip('should find several elements', async function () {
      let el1 = await driver.elementByAccessibilityId('Alert Views');
      await el1.click();
      let els = await driver.elementsByAccessibilityId('Okay / Cancel');
      els.should.have.length(2);
    });

    it('should find an element beneath another element', async function () {
      let el1 = await driver.elementByClassName('XCUIElementTypeTable');
      let el2 = await el1.elementByAccessibilityId('Alert Views');
      el2.should.exist;
    });
  });

  describe('by class name', function () {
    afterEach(async function () {
      await driver.back();
    });
    it('should return all image elements with internally generated ids', async function () {
      let el = await driver.elementByAccessibilityId('Image View');
      await el.click();

      let els = await driver.elementsByClassName('XCUIElementTypeImage');
      els.length.should.be.above(0);
      for (const el of els) {
        el.should.exist;
      }
    });

    describe('textfield case', function () {
      it('should find only one textfield', async function () {
        // TODO: this works locally but fails in CI.
        if (process.env.CI && UICATALOG_CAPS.platformVersion === '10.3') {
          return this.skip();
        }

        let el1 = await driver.elementByAccessibilityId('Alert Views');
        await el1.click();
        let el2 = await driver.elementByAccessibilityId('Okay / Cancel');
        let els = await el2.elementsByClassName('XCUIElementTypeStaticText');
        els.should.have.length(1);
      });
    });
  });

  describe('duplicate text field', function () {
    before(async function () {
      try {
        const el = await driver.elementByAccessibilityId('Text Fields');
        await driver.execute('mobile: scroll', {element: el, toVisible: true});
      } catch (ign) {}
    });
    afterEach(async function () {
      await driver.back();
    });

    after(async function () {
      // make sure we scroll back so as not to mess up subsequent tests
      const el = await driver.elementByAccessibilityId('Alert Views');
      await driver.execute('mobile: scroll', {element: el, toVisible: true});
    });

    it('should find only one element per text field', async function () {
      await driver.elementByAccessibilityId('Text Fields').click();

      let els = await driver.elementsByClassName('XCUIElementTypeTextField');
      els.should.have.length(PV_ABOVE_13 ? 5 : 4);
    });

    it('should find only one element per secure text field', async function () {
      await driver.elementByAccessibilityId('Text Fields').click();

      let els = await driver.elementsByClassName('XCUIElementTypeSecureTextField');
      els.should.have.length(1);
    });
  });

  describe('by predicate string', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find visible elements', async function () {
      let els = await driver.elements('-ios predicate string', 'visible = 1');
      els.should.have.length.above(0);
    });

    it('should find invisible elements', async function () {
      let els = await driver.elements('-ios predicate string', 'visible = 0');
      els.should.have.length.above(0);
    });

    it('should find elements with widths above 0', async function () {
      let els = await driver.elements('-ios predicate string', 'wdRect.width >= 0');
      els.should.have.length.above(0);
    });

    it('should find elements with widths between 100 and 200', async function () {
      let els = await driver.elements('-ios predicate string', 'wdRect.width BETWEEN {100,200}');
      els.should.have.length.above(0);
    });

    it('should find elements that end in the word "View" in the name', async function () {
      let els = await driver.elements('-ios predicate string', "wdName LIKE '* View'");
      els.should.have.length.above(1);
    });

    it('should find elements that have x and y coordinates greater than 0', async function () {
      let els = await driver.elements('-ios predicate string', 'wdRect.x >= 0 AND wdRect.y >= 0');
      els.should.have.length.above(1);
    });
  });

  describe('by class chain', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find elements', async function () {
      let els = await driver.elements('-ios class chain', 'XCUIElementTypeWindow');
      els.should.have.length.above(0);
    });

    it('should find child elements', async function () {
      let els = await driver.elements('-ios class chain', 'XCUIElementTypeWindow/*');
      els.should.have.length.above(0);
    });

    it('should find elements with index', async function () {
      let els = await driver.elements('-ios class chain', 'XCUIElementTypeWindow[1]/*');
      els.should.have.length.above(0);
    });

    it('should find elements with negative index', async function () {
      let els = await driver.elements('-ios class chain', 'XCUIElementTypeWindow/*[-1]');
      els.should.have.length(1);
    });
  });

  describe('magic first visible child xpath', function () {
    it('should find the first visible child of an element', async function () {
      let el = await driver.elementByClassName('XCUIElementTypeTable');
      let child = await el.elementByXPath('/*[@firstVisible="true"]');
      await child.getAttribute('type').should.eventually.eql('XCUIElementTypeCell');
      // do another call and double-check the different quote/spacing works
      let grandchild = await child.elementByXPath("/*[@firstVisible = 'true']");

      await grandchild.getAttribute('name').should.eventually.eql(FIRST_ELEMENT);
    });
  });

  describe('magic scrollable descendents xpath', function () {
    it('should find any scrollable elements', async function () {
      let els = await driver.elementsByXPath('//*[@scrollable="true"]');
      els.should.have.length(1);
      await els[0].getAttribute('type').should.eventually.eql('XCUIElementTypeTable');
    });
  });
});
