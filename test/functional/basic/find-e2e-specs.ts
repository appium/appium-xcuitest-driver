import B from 'bluebird';
import _ from 'lodash';
import {retryInterval} from 'asyncbox';
import {
  extractCapabilityValue,
  getUICatalogCaps,
  PLATFORM_VERSION,
} from '../desired';
import {PREDICATE_SEARCH, CLASS_CHAIN_SEARCH} from '../helpers/element';
import {initSession, deleteSession, MOCHA_TIMEOUT} from '../helpers/session';
import {util} from 'appium/support';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

const TEST_PAUSE_DURATION = 500;

const PV_ABOVE_13 = util.compareVersions(PLATFORM_VERSION, '>=', '13.0');

// there are some differences in the apps
const FIRST_ELEMENT = PV_ABOVE_13 ? 'Activity Indicators' : 'Action Sheets';
const APP_TITLE = PV_ABOVE_13 ? 'UIKitCatalog' : 'UICatalog';

describe('XCUITestDriver - find -', function () {
  this.timeout(MOCHA_TIMEOUT);

  let driver;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
  });

  // establish that the basic things work as we imagine
  describe('basics', function () {
    let el1;
    before(async function () {
      el1 = await driver.$('~Buttons');
      expect(el1.elementId).to.exist;
    });
    it('should find an element within descendants', async function () {
      const el2 = await el1.$('XCUIElementTypeStaticText');
      expect(await el2.getAttribute('name')).to.contain('Buttons');
    });

    it('should not find an element not within itself', async function () {
      const el2 = await el1.$('class name', 'XCUIElementTypeNavigationBar');
      expect(el2.error.error).to.equal('no such element');
    });

    it.skip('should find some elements within itself', async function () {
      const els = await el1.$$('XCUIElementTypeStaticText');
      expect(els).to.have.length(2);
    });

    it('should not find elements not within itself', async function () {
      const els = await el1.$$('XCUIElementTypeNavigationBar');
      expect(els).to.have.length(0);
    });
  });

  // make sure that elements are mixed up
  describe.skip('no mix up', function () {
    after(async function () {
      await driver.back();
    });

    it('should not allow found elements to be mixed up', async function () {
      let table = await driver.$('XCUIElementTypeTable');
      const el1 = await table.$('XCUIElementTypeStaticText');
      const el1Name = await el1.getAttribute('name');
      await el1.click();

      // we need a hard pause, because if we haven't shifted views yet
      // we will have the previous elements, so the get command will be fulfilled.
      await B.delay(1000);

      await driver.setTimeout({ implicit: 5000 });
      table = await driver.$('XCUIElementTypeTable');
      const el2 = await driver.$('XCUIElementTypeStaticText');
      const el2Name = await el2.getAttribute('name');
      expect(el1).to.not.equal(el2);
      expect(el1Name).to.not.equal(el2Name);

      // el1 is gone, so it doesn't have a name anymore
      expect(await el1.getAttribute('name')).to.equal('');
    });
  });

  describe('by id', function () {
    it('should find a single element by id', async function () {
      const el = await driver.$('~Alert Views');
      expect(el.elementId).to.exist;
    });

    it('should find a single element by id wrapped in array for multi', async function () {
      const els = await driver.$$('~Alert Views');
      expect(els).to.have.length(1);
    });

    it('should first attempt to match accessibility id', async function () {
      const el = await driver.$('~Alert Views');
      expect(await el.getAttribute('label')).to.equal('Alert Views');
    });

    it('should attempt to match by string if no accessibility id matches', async function () {
      const el = await driver.$('~Alert Views');
      expect(await el.getAttribute('label')).to.equal('Alert Views');
    });

    it.skip('should use a localized string if the id is a localization key', async function () {
      const el = await driver.$('#main.button.computeSum');
      expect(await el.getAttribute('label')).to.equal('Compute Sum');
    });

    it.skip('should be able to return multiple matches', async function () {
      const els = await driver.$$('#Cell');
      expect(els.length).to.be.greaterThan(1);
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
          const el = await driver.$('~Buttons');
          await el.click();

          expect(await driver.$$('~Button')).to.have.length.at.least(1);
        });
      });
      afterEach(async function () {
        await driver.back();
      });

      it('should respect implicit wait', async function () {
        await driver.setTimeout({ implicit: 5000 });

        const begin = Date.now();
        const el = await driver.$('//something_not_there');
        expect(el.error.error).to.equal('no such element');
        expect(Date.now() - begin).to.be.above(5000);
      });
      it.skip('should return the last button', async function () {
        const el = await driver.$('//XCUIElementTypeButton[last()]');
        expect(await el.getAttribute('name')).to.equal('Button'); // this is the name of the last button
      });
      it('should return a single element', async function () {
        const el = await driver.$('//XCUIElementTypeButton');
        expect(await el.getAttribute('label')).to.equal(APP_TITLE);
      });
      it('should return multiple elements', async function () {
        const els = await driver.$$('//XCUIElementTypeButton');
        expect(els).to.have.length.above(4);
      });
      it('should filter by name', async function () {
        const el = await driver.$(`//XCUIElementTypeButton[@name='X Button']`);
        expect(await el.getAttribute('name')).to.equal('X Button');
      });
      it('should know how to restrict root-level elements', async function () {
        const el = await driver.$('/XCUIElementTypeButton');
        expect(el.error.error).to.equal('no such element');
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
        expect(await el.getAttribute('name')).to.equal('Buttons');
      });
      it('should search an extended path by descendant', async function () {
        const els = await driver.$$('//XCUIElementTypeTable//XCUIElementTypeButton');
        const texts = await B.all(_.map(els, (el) => el.getAttribute('name')));
        expect(texts).to.not.include('UICatalog');
        expect(texts).to.not.include('UIKitCatalog');
        expect(texts).to.include('X Button');
      });
      it.skip('should filter by indices', async function () {
        const el = await driver.$('//XCUIElementTypeTable[1]//XCUIElementTypeButton[4]');
        expect(await el.getAttribute('name')).to.equal('X Button');
      });

      it('should filter by partial text', async function () {
        const el = await driver.$(
          `//XCUIElementTypeTable//XCUIElementTypeButton[contains(@name, 'X')]`,
        );
        expect(await el.getAttribute('name')).to.equal('X Button');
      });
    });

    describe.skip('multiple calls', function () {
      const runs = 5;

      before(async function () {
        // go into the right page
        const el = await driver.$('~Buttons');
        await el.click();
      });
      after(async function () {
        await driver.back();
      });

      const test = function (path, minLength) {
        return function () {
          it('should not crash', async function () {
            const els = await driver.$$(path);
            expect(els).to.have.length.above(minLength);
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
      const el1 = await driver.$('~Alert Views');
      await el1.click();
      const el2 = await driver.$('~Okay / Cancel');
      expect(await el2.getAttribute('name')).to.equal('Okay / Cancel');
    });

    it.skip('should find several elements', async function () {
      const el1 = await driver.$('~Alert Views');
      await el1.click();
      const els = await driver.$$('~Okay / Cancel');
      expect(els).to.have.length(2);
    });

    it('should find an element beneath another element', async function () {
      const el1 = await driver.$('XCUIElementTypeTable');
      const el2 = await el1.$('~Alert Views');
      expect(el2.elementId).to.exist;
    });
  });

  describe('by class name', function () {
    afterEach(async function () {
      await driver.back();
    });
    it('should return all image elements with internally generated ids', async function () {
      const el = await driver.$('~Image View');
      await el.click();

      const els = await driver.$$('XCUIElementTypeImage');
      expect(els.length).to.be.above(0);
      for (const el of els) {
        expect(el.elementId).to.exist;
      }
    });

    describe('textfield case', function () {
      it('should find only one textfield', async function () {
        // TODO: this works locally but fails in CI.
        const uiCatalogCaps = await getUICatalogCaps();
        if (
          process.env.CI &&
          extractCapabilityValue(uiCatalogCaps, 'appium:platformVersion') === '10.3'
        ) {
          return this.skip();
        }

        const el1 = await driver.$('~Alert Views');
        await el1.click();
        const el2 = await driver.$('~Okay / Cancel');
        const els = await el2.$$('XCUIElementTypeStaticText');
        expect(els).to.have.length(1);
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

      const els = await driver.$$('XCUIElementTypeTextField');
      expect(els).to.have.length(PV_ABOVE_13 ? 5 : 4);
    });

    it('should find only one element per secure text field', async function () {
      await driver.$('~Text Fields').click();

      const els = await driver.$$('XCUIElementTypeSecureTextField');
      expect(els).to.have.length(1);
    });
  });

  describe('by predicate string', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find invisible elements', async function () {
      const selector = 'visible = 0';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      expect(els).to.have.length.above(0);
    });

    it('should find elements with widths above 0', async function () {
      const selector = 'wdRect.width >= 0';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      expect(els).to.have.length.above(0);
    });

    it('should find elements with widths between 100 and 200', async function () {
      const selector = 'wdRect.width BETWEEN {100,200}';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      expect(els).to.have.length.above(0);
    });

    it('should find elements that end in the word "View" in the name', async function () {
      const selector = "wdName LIKE '* View'";
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      expect(els).to.have.length.above(1);
    });

    it('should find elements that have x and y coordinates greater than 0', async function () {
      const selector = 'wdRect.x >= 0 AND wdRect.y >= 0';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      expect(els).to.have.length.above(1);
    });
  });

  describe('by class chain', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find elements', async function () {
      const selector = 'XCUIElementTypeWindow';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      expect(els).to.have.length.above(0);
    });

    it('should find child elements', async function () {
      const selector = 'XCUIElementTypeWindow/*';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      expect(els).to.have.length.above(0);
    });

    it('should find elements with index', async function () {
      const selector = 'XCUIElementTypeWindow[1]/*';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      expect(els).to.have.length.above(0);
    });

    it('should find elements with negative index', async function () {
      const selector = 'XCUIElementTypeWindow/*[-1]';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      expect(els).to.have.length(1);
    });
  });
  describe('by css selector', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await B.delay(TEST_PAUSE_DURATION);
    });
    it('should find cell types', async function () {
      const cellEls = await driver.$$('cell');
      expect(cellEls).to.have.length.above(1);
    });
    it('should find elements', async function () {
      const els = await driver.$$('window');
      expect(els).to.have.length.above(0);
    });

    it('should find child elements', async function () {
      const els = await driver.$$('window > *');
      expect(els).to.have.length.above(0);
    });

    it('should find elements with index', async function () {
      const els = await driver.$$('window:nth-child(1) > *');
      expect(els).to.have.length.above(0);
    });

    it('should find elements with negative index', async function () {
      const els = await driver.$$('window > *:nth-child(-1)');
      expect(els).to.have.length(1);
    });

    it('should work with a nested CSS selector', async function () {
      const imageViewButtons = await driver.$$('cell > staticText[value="Image View"]');
      expect(imageViewButtons).to.have.length(1);
    });
  });

  describe('magic first visible child xpath', function () {
    it('should find the first visible child of an element', async function () {
      const el = await driver.$('XCUIElementTypeTable');
      const child = await el.$('/*[@firstVisible="true"]');
      await expect(child.getAttribute('type')).to.eventually.eql('XCUIElementTypeCell');
      // do another call and double-check the different quote/spacing works
      const grandchild = await child.$("/*[@firstVisible = 'true']");

      const type = await grandchild.getAttribute('type');
      if (type === 'XCUIElementTypeStaticText') {
        await expect(grandchild.getAttribute('name')).to.eventually.eql(FIRST_ELEMENT);
      } else {
        expect(type).to.equal('XCUIElementTypeOther');
      }
    });
  });

  describe('magic scrollable descendents xpath', function () {
    it('should find any scrollable elements', async function () {
      const els = await driver.$$('//*[@scrollable="true"]');
      expect(els).to.have.length(1);
      await expect(els[0].getAttribute('type')).to.eventually.eql('XCUIElementTypeTable');
    });
  });
});

