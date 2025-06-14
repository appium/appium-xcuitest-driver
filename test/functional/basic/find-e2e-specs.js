import B from 'bluebird';
import _ from 'lodash';
import {retryInterval} from 'asyncbox';
import {
  extractCapabilityValue,
  amendCapabilities,
  UICATALOG_CAPS,
  PLATFORM_VERSION,
} from '../desired';
import {PREDICATE_SEARCH, CLASS_CHAIN_SEARCH} from '../helpers/element';
import {initSession, deleteSession, hasDefaultPrebuiltWDA, MOCHA_TIMEOUT} from '../helpers/session';
import {util} from 'appium/support';


const TEST_PAUSE_DURATION = 500;

const PV_ABOVE_13 = util.compareVersions(PLATFORM_VERSION, '>=', '13.0');

// there are some differences in the apps
const FIRST_ELEMENT = PV_ABOVE_13 ? 'Activity Indicators' : 'Action Sheets';
const APP_TITLE = PV_ABOVE_13 ? 'UIKitCatalog' : 'UICatalog';

describe('XCUITestDriver - find -', function () {
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

  // establish that the basic things work as we imagine
  describe('basics', function () {
    let el1;
    before(async function () {
      el1 = await driver.$('~Buttons');
      el1.elementId.should.exist;
    });
    it('should find an element within descendants', async function () {
      let el2 = await el1.$('XCUIElementTypeStaticText');
      (await el2.getAttribute('name')).should.contain('Buttons');
    });

    it('should not find an element not within itself', async function () {
      const el2 = await el1.$('class name', 'XCUIElementTypeNavigationBar');
      el2.error.error.should.equal('no such element');
    });

    it.skip('should find some elements within itself', async function () {
      let els = await el1.$$('XCUIElementTypeStaticText');
      els.should.have.length(2);
    });

    it('should not find elements not within itself', async function () {
      let els = await el1.$$('XCUIElementTypeNavigationBar');
      els.should.have.length(0);
    });
  });

  // make sure that elements are mixed up
  describe.skip('no mix up', function () {
    after(async function () {
      await driver.back();
    });

    it('should not allow found elements to be mixed up', async function () {
      let table = await driver.$('XCUIElementTypeTable');
      let el1 = await table.$('XCUIElementTypeStaticText');
      let el1Name = await el1.getAttribute('name');
      await el1.click();

      // we need a hard pause, because if we haven't shifted views yet
      // we will have the previous elements, so the get command will be fulfilled.
      await B.delay(1000);

      await driver.setTimeout({ implicit: 5000 });
      table = await driver.$('XCUIElementTypeTable');
      let el2 = await driver.$('XCUIElementTypeStaticText');
      let el2Name = await el2.getAttribute('name');
      el1.should.not.equal(el2);
      el1Name.should.not.equal(el2Name);

      // el1 is gone, so it doesn't have a name anymore
      (await el1.getAttribute('name')).should.equal('');
    });
  });

  describe('by id', function () {
    it('should find a single element by id', async function () {
      let el = await driver.$('~Alert Views');
      el.elementId.should.exist;
    });

    it('should find a single element by id wrapped in array for multi', async function () {
      let els = await driver.$$('~Alert Views');
      els.should.have.length(1);
    });

    it('should first attempt to match accessibility id', async function () {
      let el = await driver.$('~Alert Views');
      (await el.getAttribute('label')).should.equal('Alert Views');
    });

    it('should attempt to match by string if no accessibility id matches', async function () {
      let el = await driver.$('~Alert Views');
      (await el.getAttribute('label')).should.equal('Alert Views');
    });

    it.skip('should use a localized string if the id is a localization key', async function () {
      let el = await driver.$('#main.button.computeSum');
      (await el.getAttribute('label')).should.equal('Compute Sum');
    });

    it.skip('should be able to return multiple matches', async function () {
      let els = await driver.$$('#Cell');
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
        } catch {}
      });
      beforeEach(async function () {
        // go into the right page
        await retryInterval(10, 500, async () => {
          let el = await driver.$('~Buttons');
          await el.click();

          (await driver.$$('~Button')).should.have.length.at.least(1);
        });
      });
      afterEach(async function () {
        await driver.back();
      });

      it('should respect implicit wait', async function () {
        await driver.setTimeout({ implicit: 5000 });

        let begin = Date.now();
        const el = await driver.$('//something_not_there');
        el.error.error.should.equal('no such element');
        (Date.now() - begin).should.be.above(5000);
      });
      it.skip('should return the last button', async function () {
        let el = await driver.$('//XCUIElementTypeButton[last()]');
        (await el.getAttribute('name')).should.equal('Button'); // this is the name of the last button
      });
      it('should return a single element', async function () {
        let el = await driver.$('//XCUIElementTypeButton');
        (await el.getAttribute('label')).should.equal(APP_TITLE);
      });
      it('should return multiple elements', async function () {
        let els = await driver.$$('//XCUIElementTypeButton');
        els.should.have.length.above(4);
      });
      it('should filter by name', async function () {
        let el = await driver.$(`//XCUIElementTypeButton[@name='X Button']`);
        (await el.getAttribute('name')).should.equal('X Button');
      });
      it('should know how to restrict root-level elements', async function () {
        const el = await driver.$('/XCUIElementTypeButton');
        el.error.error.should.equal('no such element');
      });
      it('should search an extended path by child', async function () {
        // pause a moment or the next command gets stuck getting the xpath :(
        await B.delay(TEST_PAUSE_DURATION);

        let el;
        try {
          el = await driver.$('//XCUIElementTypeNavigationBar/XCUIElementTypeStaticText');
        } catch {
          el = await driver.$('//XCUIElementTypeNavigationBar/XCUIElementTypeOther');
        }
        (await el.getAttribute('name')).should.equal('Buttons');
      });
      it('should search an extended path by descendant', async function () {
        let els = await driver.$$('//XCUIElementTypeTable//XCUIElementTypeButton');
        let texts = await B.all(_.map(els, (el) => el.getAttribute('name')));
        texts.should.not.include('UICatalog');
        texts.should.not.include('UIKitCatalog');
        texts.should.include('X Button');
      });
      it.skip('should filter by indices', async function () {
        let el = await driver.$('//XCUIElementTypeTable[1]//XCUIElementTypeButton[4]');
        (await el.getAttribute('name')).should.equal('X Button');
      });

      it('should filter by partial text', async function () {
        let el = await driver.$(
          `//XCUIElementTypeTable//XCUIElementTypeButton[contains(@name, 'X')]`,
        );
        (await el.getAttribute('name')).should.equal('X Button');
      });
    });

    describe.skip('multiple calls', function () {
      let runs = 5;

      before(async function () {
        // go into the right page
        let el = await driver.$('~Buttons');
        await el.click();
      });
      after(async function () {
        await driver.back();
      });

      let test = function (path, minLength) {
        return function () {
          it('should not crash', async function () {
            let els = await driver.$$(path);
            els.should.have.length.above(minLength);
          });
        };
      };

      describe.skip('finding specific path', function () {
        for (let n = 0; n < runs; n++) {
          describe(
            `test ${n + 1}`,
            test('//XCUIElementTypeApplication[0]/XCUIElementTypeWindow[0]', 17),
          );
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
      let el1 = await driver.$('~Alert Views');
      await el1.click();
      let el2 = await driver.$('~Okay / Cancel');
      (await el2.getAttribute('name')).should.equal('Okay / Cancel');
    });

    it.skip('should find several elements', async function () {
      let el1 = await driver.$('~Alert Views');
      await el1.click();
      let els = await driver.$$('~Okay / Cancel');
      els.should.have.length(2);
    });

    it('should find an element beneath another element', async function () {
      let el1 = await driver.$('XCUIElementTypeTable');
      let el2 = await el1.$('~Alert Views');
      el2.elementId.should.exist;
    });
  });

  describe('by class name', function () {
    afterEach(async function () {
      await driver.back();
    });
    it('should return all image elements with internally generated ids', async function () {
      let el = await driver.$('~Image View');
      await el.click();

      let els = await driver.$$('XCUIElementTypeImage');
      els.length.should.be.above(0);
      for (const el of els) {
        el.elementId.should.exist;
      }
    });

    describe('textfield case', function () {
      it('should find only one textfield', async function () {
        // TODO: this works locally but fails in CI.
        if (
          process.env.CI &&
          extractCapabilityValue(UICATALOG_CAPS, 'appium:platformVersion') === '10.3'
        ) {
          return this.skip();
        }

        let el1 = await driver.$('~Alert Views');
        await el1.click();
        let el2 = await driver.$('~Okay / Cancel');
        let els = await el2.$$('XCUIElementTypeStaticText');
        els.should.have.length(1);
      });
    });
  });

  describe('duplicate text field', function () {
    before(async function () {
      try {
        const el = await driver.$('~Text Fields');
        await driver.execute('mobile: scroll', {element: el.elementId, toVisible: true});
      } catch {}
    });
    afterEach(async function () {
      await driver.back();
    });

    after(async function () {
      // make sure we scroll back so as not to mess up subsequent tests
      const el = await driver.$('~Alert Views');
      await driver.execute('mobile: scroll', {element: el.elementId, toVisible: true});
    });

    it('should find only one element per text field', async function () {
      await driver.$('~Text Fields').click();

      let els = await driver.$$('XCUIElementTypeTextField');
      els.should.have.length(PV_ABOVE_13 ? 5 : 4);
    });

    it('should find only one element per secure text field', async function () {
      await driver.$('~Text Fields').click();

      let els = await driver.$$('XCUIElementTypeSecureTextField');
      els.should.have.length(1);
    });
  });

  describe('by predicate string', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find invisible elements', async function () {
      const selector = 'visible = 0';
      let els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      els.should.have.length.above(0);
    });

    it('should find elements with widths above 0', async function () {
      const selector = 'wdRect.width >= 0';
      let els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      els.should.have.length.above(0);
    });

    it('should find elements with widths between 100 and 200', async function () {
      const selector = 'wdRect.width BETWEEN {100,200}';
      let els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      els.should.have.length.above(0);
    });

    it('should find elements that end in the word "View" in the name', async function () {
      const selector = "wdName LIKE '* View'";
      let els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      els.should.have.length.above(1);
    });

    it('should find elements that have x and y coordinates greater than 0', async function () {
      const selector = 'wdRect.x >= 0 AND wdRect.y >= 0';
      let els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      els.should.have.length.above(1);
    });
  });

  describe('by class chain', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find elements', async function () {
      const selector = 'XCUIElementTypeWindow';
      let els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      els.should.have.length.above(0);
    });

    it('should find child elements', async function () {
      const selector = 'XCUIElementTypeWindow/*';
      let els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      els.should.have.length.above(0);
    });

    it('should find elements with index', async function () {
      const selector = 'XCUIElementTypeWindow[1]/*';
      let els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      els.should.have.length.above(0);
    });

    it('should find elements with negative index', async function () {
      const selector = 'XCUIElementTypeWindow/*[-1]';
      let els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      els.should.have.length(1);
    });
  });
  describe('by css selector', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find cell types', async function () {
      let cellEls = await driver.$$('cell');
      cellEls.should.have.length.above(1);
    });
    it('should find elements', async function () {
      let els = await driver.$$('window');
      els.should.have.length.above(0);
    });

    it('should find child elements', async function () {
      let els = await driver.$$('window > *');
      els.should.have.length.above(0);
    });

    it('should find elements with index', async function () {
      let els = await driver.$$('window:nth-child(1) > *');
      els.should.have.length.above(0);
    });

    it('should find elements with negative index', async function () {
      let els = await driver.$$('window > *:nth-child(-1)');
      els.should.have.length(1);
    });

    it('should work with a nested CSS selector', async function () {
      let imageViewButtons = await driver.$$('cell > staticText[value="Image View"]');
      imageViewButtons.should.have.length(1);
    });
  });

  describe('magic first visible child xpath', function () {
    it('should find the first visible child of an element', async function () {
      let el = await driver.$('XCUIElementTypeTable');
      let child = await el.$('/*[@firstVisible="true"]');
      await child.getAttribute('type').should.eventually.eql('XCUIElementTypeCell');
      // do another call and double-check the different quote/spacing works
      let grandchild = await child.$("/*[@firstVisible = 'true']");

      const type = await grandchild.getAttribute('type');
      if (type === 'XCUIElementTypeStaticText') {
        await grandchild.getAttribute('name').should.eventually.eql(FIRST_ELEMENT);
      } else {
        type.should.equal('XCUIElementTypeOther');
      }
    });
  });

  describe('magic scrollable descendents xpath', function () {
    it('should find any scrollable elements', async function () {
      let els = await driver.$$('//*[@scrollable="true"]');
      els.should.have.length(1);
      await els[0].getAttribute('type').should.eventually.eql('XCUIElementTypeTable');
    });
  });
});
