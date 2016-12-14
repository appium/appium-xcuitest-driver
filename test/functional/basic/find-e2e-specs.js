import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import B from 'bluebird';
import _ from 'lodash';
import { UICATALOG_CAPS } from '../desired';
import { initSession, deleteSession } from '../helpers/session';


chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver - find', function () {
  this.timeout(200 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async () => {
    await deleteSession();
  });

  describe('by id', () => {
    it('should find a single element by id', async () => {
      let el = await driver.elementById('Alert Views');
      el.should.exist;
    });

    it('should find a single element by id wrapped in array for multi', async () => {
      let els = await driver.elementsById('Alert Views');
      els.should.have.length(1);
    });

    it('should first attempt to match accessibility id', async () => {
      let el = await driver.elementById('Alert Views');
      (await el.getAttribute('label')).should.equal('Alert Views');
    });

    it('should attempt to match by string if no accessibility id matches', async () => {
      let el = await driver.elementById('Alert Views');
      (await el.getAttribute('label')).should.equal('Alert Views');
    });

    it.skip('should use a localized string if the id is a localization key', async () => {
      let el = await driver.elementById('main.button.computeSum');
      (await el.getAttribute('label')).should.equal('Compute Sum');
    });

    it.skip('should be able to return multiple matches', async () => {
      let els = await driver.elementsById('Cell');
      els.length.should.be.greaterThan(1);
    });
  });
});

describe('XCUITestDriver - find', function () {
  this.timeout(200 * 1000);

  let driver;
  before(async () => {
    driver = await initSession(UICATALOG_CAPS);
  });
  after(async () => {
    await deleteSession();
  });

  // establish that the basic things work as we imagine
  describe('basics', () => {
    let el1;
    before(async () => {
      el1 = await driver.elementByAccessibilityId('Buttons');
      el1.should.exist;
    });
    it('should find an element within descendants', async () => {
      let el2 = await el1.elementByClassName('XCUIElementTypeStaticText');
      (await el2.getAttribute('name')).should.contain("Buttons");
    });

    it('should not find an element not within itself', async () => {
      await B.resolve(el1.elementByClassName('XCUIElementTypeNavigationBar'))
        .should.be.rejectedWith(/Error response status: 7/);
    });

    it.skip('should find some elements within itself', async () => {
      let els = await el1.elementsByClassName('XCUIElementTypeStaticText');
      els.should.have.length(2);
    });

    it('should not find elements not within itself', async () => {
      let els = await el1.elementsByClassName('XCUIElementTypeNavigationBar');
      els.should.have.length(0);
    });
  });

  // make sure that elements are mixed up
  describe.skip('no mix up', () => {
    after(async() => {
      await driver.back();
    });

    it('should not allow found elements to be mixed up', async () => {
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
      (await el1.getAttribute('name')).should.equal("");
    });
  });

  describe('by xpath', () => {
    describe('individual calls', function () {
      before(async () => {
        // before anything, try to go back
        // otherwise the tests will fail erroneously
        await driver.back();

        // and make sure we are at the top of the page
        try {
          await driver.execute('mobile: scroll', {direction: 'up'});
        } catch (ign) {}
      });
      beforeEach(async () => {
        // go into the right page
        let el = await driver.elementByAccessibilityId('Buttons');
        await el.click();
      });
      afterEach(async () => {
        await driver.back();
      });

      it('should respect implicit wait', async () => {
        await driver.setImplicitWaitTimeout(5000);

        let begin = Date.now();
        await driver.elementByXPath('//something_not_there')
          .should.eventually.be.rejected;
        (Date.now() - begin).should.be.above(5000);
      });
      it.skip('should return the last button', async () => {
        let el = await driver.elementByXPath('//XCUIElementTypeButton[last()]');
        (await el.getAttribute('name')).should.equal('Button'); // this is the name of the last button
      });
      it('should return a single element', async () => {
        let el = await driver.elementByXPath('//XCUIElementTypeButton');
        (await el.getAttribute('name')).should.equal('UICatalog');
      });
      it('should return multiple elements', async () => {
        let els = await driver.elementsByXPath('//XCUIElementTypeButton');
        els.should.have.length.above(5);
      });
      it('should filter by name', async () => {
        let el = await driver.elementByXPath("//XCUIElementTypeButton[@name='X Button']");
        (await el.getAttribute('name')).should.equal('X Button');
      });
      it('should know how to restrict root-level elements', async () => {
        await driver.elementByXPath('/XCUIElementTypeButton').should.be.rejectedWith(/NoSuchElement/);
      });
      it('should search an extended path by child', async () => {
        // pause a moment or the next command gets stuck getting the xpath :(
        await B.delay(500);
        let el = await driver.elementByXPath('//XCUIElementTypeNavigationBar/XCUIElementTypeStaticText');
        (await el.getAttribute('name')).should.equal('Buttons');
      });
      it('should search an extended path by descendant', async () => {
        let els = await driver.elementsByXPath('//XCUIElementTypeTable//XCUIElementTypeButton');
        let texts = await B.all(_.map(els, (el) => el.getAttribute('name')));
        texts.should.not.include('UICatalog');
        texts.should.include('X Button');
      });
      it.skip('should filter by indices', async () => {
        await driver.setImplicitWaitTimeout(10000);
        let el = await driver.elementByXPath('//XCUIElementTypeTable[1]//XCUIElementTypeButton[4]');
        (await el.getAttribute('name')).should.equal('X Button');
      });

      it('should filter by partial text', async () => {
        let el = await driver.elementByXPath("//XCUIElementTypeTable//XCUIElementTypeButton[contains(@name, 'X ')]");
        (await el.getAttribute('name')).should.equal('X Button');
      });
    });

    describe.skip('multiple calls', function () {
      let runs = 5;

      before(async () => {
        // go into the right page
        let el = await driver.elementByAccessibilityId('Buttons');
        await el.click();
      });
      after(async () => {
        await driver.back();
      });

      let test = function (path, minLength) {
        return function () {
          it('should not crash', async () => {
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
          describe(`test ${n + 1}`, test("//*", 52));
        }
      });
    });
  });

  describe('by accessibility id', () => {
    afterEach(async () => {
      await driver.back();
    });

    it('should find one element', async () => {
      let el1 = await driver.elementByAccessibilityId('Action Sheets');
      await el1.click();
      let el2 = await driver.elementByAccessibilityId('Okay / Cancel');
      (await el2.getAttribute('name')).should.equal('Okay / Cancel');
    });

    it.skip('should find several elements', async () => {
      let el1 = await driver.elementByAccessibilityId('Action Sheets');
      await el1.click();
      let els = await driver.elementsByAccessibilityId('Okay / Cancel');
      els.should.have.length(2);
    });

    it('should find an element beneath another element', async () => {
      let el1 = await driver.elementByClassName('XCUIElementTypeTable');
      let el2 = await el1.elementByAccessibilityId('Action Sheets');
      el2.should.exist;
    });
  });

  describe('by class name', () => {
    afterEach(async () => {
      await driver.back();
    });
    it('should return all image elements with internally generated ids', async function () {
      let el = await driver.elementByAccessibilityId('Image View');
      await el.click();

      let els = await driver.elementsByClassName('XCUIElementTypeImage');
      els.length.should.be.above(0);
      for (let el of els) {
        el.should.exist;
      }
    });

    describe('textfield case', () => {
      it('should find only one textfield', async () => {
        let el1 = await driver.elementByAccessibilityId('Action Sheets');
        await el1.click();
        let el2 = await driver.elementByAccessibilityId('Okay / Cancel');
        let els = await el2.elementsByClassName('XCUIElementTypeStaticText');
        els.should.have.length(1);
      });
    });
  });

  describe('duplicate text field', () => {
    beforeEach(async () => {
      try {
        let element = await driver.elementByClassName('XCUIElementTypeTable');
        await driver.execute('mobile: scroll', {element, direction: 'down', name: 'Text Fields'});
      } catch (ign) {}
      await driver.setImplicitWaitTimeout(5000);
    });
    afterEach(async () => {
      await driver.back();
    });

    it('should find only one element per text field', async () => {
      let el = await driver.elementByAccessibilityId('Text Fields');
      await el.click();

      let els = await driver.elementsByClassName('XCUIElementTypeTextField');
      els.should.have.length(4);
    });

    it('should find only one element per secure text field', async () => {
      let el = await driver.elementByAccessibilityId('Text Fields');
      await el.click();

      let els = await driver.elementsByClassName('XCUIElementTypeSecureTextField');
      els.should.have.length(1);
    });
  });

  describe('by predicate string', () => {
    before(async () => {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(500);
    });
    it.skip('should find visible elements', async () => {
      // skipped until WDA fixes predicates
      let els = await driver.elements('-ios predicate string', 'visible = 1');
      els.should.have.length.above(0);
    });

    it.skip('should find invisible elements', async () => {
      // skipped until WDA fixes predicates
      let els = await driver.elements('-ios predicate string', 'visible = 0');
      els.should.have.length.above(0);
    });

    it('should find elements with widths above 0', async () => {
      let els = await driver.elements('-ios predicate string', 'wdRect.width >= 0');
      els.should.have.length.above(0);
    });

    it('should find elements with widths between 100 and 200', async () => {
      let els = await driver.elements('-ios predicate string', 'wdRect.width BETWEEN {100,200}');
      els.should.have.length.above(0);
    });

    it('should find elements that end in the word "View" in the name', async () => {
      let els = await driver.elements('-ios predicate string', "wdName LIKE '* View'");
      els.should.have.length.above(1);
    });

    it('should find elements that have x and y coordinates greater than 0', async () => {
      let els = await driver.elements('-ios predicate string', 'wdRect.x >= 0 AND wdRect.y >= 0');
      els.should.have.length.above(1);
    });

  });
});
