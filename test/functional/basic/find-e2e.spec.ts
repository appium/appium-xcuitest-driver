import assert from 'node:assert/strict';
import {describe, it, before, after, beforeEach, afterEach, type TestContext} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {util} from 'appium/support.js';
import {retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

import {extractCapabilityValue, getUICatalogCaps, PLATFORM_VERSION} from '../desired.js';
import {PREDICATE_SEARCH, CLASS_CHAIN_SEARCH} from '../helpers/element.js';
import {initSession, deleteSession} from '../helpers/session.js';

const TEST_PAUSE_DURATION = 500;

const PV_ABOVE_13 = util.compareVersions(PLATFORM_VERSION, '>=', '13.0');

// there are some differences in the apps
const FIRST_ELEMENT = PV_ABOVE_13 ? 'Activity Indicators' : 'Action Sheets';
const APP_TITLE = PV_ABOVE_13 ? 'UIKitCatalog' : 'UICatalog';

describe('XCUITestDriver - find -', function () {
  let driver: Browser;

  before(async function () {
    const uiCatalogCaps = await getUICatalogCaps();
    driver = await initSession(uiCatalogCaps);
  });
  after(async function () {
    await deleteSession();
  });

  // establish that the basic things work as we imagine
  describe('basics', function () {
    let el1: any;
    before(async function () {
      el1 = await driver.$('~Buttons');
      assert.ok(el1.elementId);
    });
    it('should find an element within descendants', async function () {
      const el2 = await el1.$('XCUIElementTypeStaticText');
      assert.ok((await el2.getAttribute('name')).includes('Buttons'));
    });

    it('should not find an element not within itself', async function () {
      const el2 = await el1.$('class name', 'XCUIElementTypeNavigationBar');
      assert.strictEqual(el2.error.error, 'no such element');
    });

    it.skip('should find some elements within itself', async function () {
      const els = await el1.$$('XCUIElementTypeStaticText');
      assert.strictEqual(els.length, 2);
    });

    it('should not find elements not within itself', async function () {
      const els = await el1.$$('XCUIElementTypeNavigationBar');
      assert.strictEqual(els.length, 0);
    });
  });

  // make sure that elements are mixed up
  describe.skip('no mix up', function () {
    after(async function () {
      await driver.back();
    });

    it('should not allow found elements to be mixed up', async function () {
      const table = await driver.$('XCUIElementTypeTable');
      const el1 = await table.$('XCUIElementTypeStaticText');
      const el1Name = await el1.getAttribute('name');
      await el1.click();

      // we need a hard pause, because if we haven't shifted views yet
      // we will have the previous elements, so the get command will be fulfilled.
      await delay(1000);

      await driver.setTimeout({implicit: 5000});
      const el2 = await driver.$('XCUIElementTypeStaticText');
      const el2Name = await el2.getAttribute('name');
      assert.notStrictEqual(el1, el2);
      assert.notStrictEqual(el1Name, el2Name);

      // el1 is gone, so it doesn't have a name anymore
      assert.strictEqual(await el1.getAttribute('name'), '');
    });
  });

  describe('by id', function () {
    it('should find a single element by id', async function () {
      const el = await driver.$('~Alert Views');
      assert.ok(el.elementId);
    });

    it('should find a single element by id wrapped in array for multi', async function () {
      const els = await driver.$$('~Alert Views');
      assert.strictEqual(els.length, 1);
    });

    it('should first attempt to match accessibility id', async function () {
      const el = await driver.$('~Alert Views');
      assert.strictEqual(await el.getAttribute('label'), 'Alert Views');
    });

    it('should attempt to match by string if no accessibility id matches', async function () {
      const el = await driver.$('~Alert Views');
      assert.strictEqual(await el.getAttribute('label'), 'Alert Views');
    });

    it.skip('should use a localized string if the id is a localization key', async function () {
      const el = await driver.$('#main.button.computeSum');
      assert.strictEqual(await el.getAttribute('label'), 'Compute Sum');
    });

    it.skip('should be able to return multiple matches', async function () {
      const els = await driver.$$('#Cell');
      assert.ok((els.length as unknown as number) > 1);
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

          assert.ok(((await driver.$$('~Button')).length as unknown as number) >= 1);
        });
      });
      afterEach(async function () {
        await driver.back();
      });

      it('should respect implicit wait', async function () {
        await driver.setTimeout({implicit: 5000});

        const begin = Date.now();
        const el = await driver.$('//something_not_there');
        assert.strictEqual((el as any).error.error, 'no such element');
        assert.ok(Date.now() - begin > 5000);
      });
      it.skip('should return the last button', async function () {
        const el = await driver.$('//XCUIElementTypeButton[last()]');
        assert.strictEqual(await el.getAttribute('name'), 'Button'); // this is the name of the last button
      });
      it('should return a single element', async function () {
        const el = await driver.$('//XCUIElementTypeButton');
        assert.strictEqual(await el.getAttribute('label'), APP_TITLE);
      });
      it('should return multiple elements', async function () {
        const els = await driver.$$('//XCUIElementTypeButton');
        assert.ok((els.length as unknown as number) > 4);
      });
      it('should filter by name', async function () {
        const el = await driver.$(`//XCUIElementTypeButton[@name='X Button']`);
        assert.strictEqual(await el.getAttribute('name'), 'X Button');
      });
      it('should know how to restrict root-level elements', async function () {
        const el = await driver.$('/XCUIElementTypeButton');
        assert.strictEqual((el as any).error.error, 'no such element');
      });
      it('should search an extended path by child', async function () {
        // pause a moment or the next command gets stuck getting the xpath :(
        await delay(TEST_PAUSE_DURATION);

        let el;
        try {
          el = await driver.$('//XCUIElementTypeNavigationBar/XCUIElementTypeStaticText');
        } catch {
          el = await driver.$('//XCUIElementTypeNavigationBar/XCUIElementTypeOther');
        }
        assert.strictEqual(await el.getAttribute('name'), 'Buttons');
      });
      it('should search an extended path by descendant', async function () {
        const els = await driver.$$('//XCUIElementTypeTable//XCUIElementTypeButton');
        const texts = await Promise.all([...els].map((el) => el.getAttribute('name')));
        assert.ok(!texts.includes('UICatalog'));
        assert.ok(!texts.includes('UIKitCatalog'));
        assert.ok(texts.includes('X Button'));
      });
      it.skip('should filter by indices', async function () {
        const el = await driver.$('//XCUIElementTypeTable[1]//XCUIElementTypeButton[4]');
        assert.strictEqual(await el.getAttribute('name'), 'X Button');
      });

      it('should filter by partial text', async function () {
        const el = await driver.$(`//XCUIElementTypeTable//XCUIElementTypeButton[contains(@name, 'X')]`);
        assert.strictEqual(await el.getAttribute('name'), 'X Button');
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

      const test = function (path: string, minLength: number) {
        return function () {
          it('should not crash', async function () {
            const els = await driver.$$(path);
            assert.ok((els.length as unknown as number) > minLength);
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
      const el1 = await driver.$('~Alert Views');
      await el1.click();
      const el2 = await driver.$('~Okay / Cancel');
      assert.strictEqual(await el2.getAttribute('name'), 'Okay / Cancel');
    });

    it.skip('should find several elements', async function () {
      const el1 = await driver.$('~Alert Views');
      await el1.click();
      const els = await driver.$$('~Okay / Cancel');
      assert.strictEqual(els.length, 2);
    });

    it('should find an element beneath another element', async function () {
      const el1 = await driver.$('XCUIElementTypeTable');
      const el2 = await el1.$('~Alert Views');
      assert.ok(el2.elementId);
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
      assert.ok((els.length as unknown as number) > 0);
      for (const el of els) {
        assert.ok(el.elementId);
      }
    });

    describe('textfield case', function () {
      it('should find only one textfield', async function (ctx: TestContext) {
        // TODO: this works locally but fails in CI.
        const uiCatalogCaps = await getUICatalogCaps();
        if (process.env.CI && extractCapabilityValue(uiCatalogCaps, 'appium:platformVersion') === '10.3') {
          return ctx.skip();
        }

        const el1 = await driver.$('~Alert Views');
        await el1.click();
        const el2 = await driver.$('~Okay / Cancel');
        const els = await el2.$$('XCUIElementTypeStaticText');
        assert.strictEqual(els.length, 1);
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
      assert.strictEqual(els.length, PV_ABOVE_13 ? 5 : 4);
    });

    it('should find only one element per secure text field', async function () {
      await driver.$('~Text Fields').click();

      const els = await driver.$$('XCUIElementTypeSecureTextField');
      assert.strictEqual(els.length, 1);
    });
  });

  describe('by predicate string', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await delay(TEST_PAUSE_DURATION);
    });
    it('should find invisible elements', async function () {
      const selector = 'visible = 0';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements with widths above 0', async function () {
      const selector = 'wdRect.width >= 0';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements with widths between 100 and 200', async function () {
      const selector = 'wdRect.width BETWEEN {100,200}';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements that end in the word "View" in the name', async function () {
      const selector = "wdName LIKE '* View'";
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 1);
    });

    it('should find elements that have x and y coordinates greater than 0', async function () {
      const selector = 'wdRect.x >= 0 AND wdRect.y >= 0';
      const els = await driver.$$(`${PREDICATE_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 1);
    });
  });

  describe('by class chain', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await delay(TEST_PAUSE_DURATION);
    });
    it('should find elements', async function () {
      const selector = 'XCUIElementTypeWindow';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find child elements', async function () {
      const selector = 'XCUIElementTypeWindow/*';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements with index', async function () {
      const selector = 'XCUIElementTypeWindow[1]/*';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements with negative index', async function () {
      const selector = 'XCUIElementTypeWindow/*[-1]';
      const els = await driver.$$(`${CLASS_CHAIN_SEARCH}:${selector}`);
      assert.strictEqual(els.length, 1);
    });
  });
  describe('by css selector', function () {
    before(async function () {
      // if we don't pause, WDA freaks out sometimes, especially on fast systems
      await delay(TEST_PAUSE_DURATION);
    });
    it('should find cell types', async function () {
      const cellEls = await driver.$$('cell');
      assert.ok((cellEls.length as unknown as number) > 1);
    });
    it('should find elements', async function () {
      const els = await driver.$$('window');
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find child elements', async function () {
      const els = await driver.$$('window > *');
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements with index', async function () {
      const els = await driver.$$('window:nth-child(1) > *');
      assert.ok((els.length as unknown as number) > 0);
    });

    it('should find elements with negative index', async function () {
      const els = await driver.$$('window > *:nth-child(-1)');
      assert.strictEqual(els.length, 1);
    });

    it('should work with a nested CSS selector', async function () {
      const imageViewButtons = await driver.$$('cell > staticText[value="Image View"]');
      assert.strictEqual(imageViewButtons.length, 1);
    });
  });

  describe('magic first visible child xpath', function () {
    it('should find the first visible child of an element', async function () {
      const el = await driver.$('XCUIElementTypeTable');
      const child = await el.$('/*[@firstVisible="true"]');
      assert.strictEqual(await child.getAttribute('type'), 'XCUIElementTypeCell');
      // do another call and double-check the different quote/spacing works
      const grandchild = await child.$("/*[@firstVisible = 'true']");

      const type = await grandchild.getAttribute('type');
      if (type === 'XCUIElementTypeStaticText') {
        assert.strictEqual(await grandchild.getAttribute('name'), FIRST_ELEMENT);
      } else {
        assert.strictEqual(type, 'XCUIElementTypeOther');
      }
    });
  });

  describe('magic scrollable descendents xpath', function () {
    it('should find any scrollable elements', async function () {
      const els = await driver.$$('//*[@scrollable="true"]');
      assert.strictEqual(els.length, 1);
      assert.strictEqual(await els[0].getAttribute('type'), 'XCUIElementTypeTable');
    });
  });
});
