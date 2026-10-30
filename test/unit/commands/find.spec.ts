import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('general commands', function () {
  const driver = new XCUITestDriver({} as any);
  const proxySpy = sinon.stub(driver, 'proxyCommand');
  afterEach(function () {
    proxySpy.reset();
  });

  describe('findNativeElementOrElements', function () {
    /**
     *
     * @param {string} strategy
     * @param {string} selector
     * @param {string} modSelector
     * @param {string|null} modStrategy
     * @param {boolean} mult
     */
    async function verifyFind(
      strategy: string,
      selector: string,
      modSelector: string,
      modStrategy: string | null = null,
      mult = false,
    ) {
      try {
        await driver.findNativeElementOrElements(strategy, selector, mult);
      } catch {}
      assert.strictEqual(
        proxySpy.calledOnceWith(`/element${mult ? 's' : ''}`, 'POST', {
          using: modStrategy || strategy,
          value: modSelector,
        }),
        true,
      );
      proxySpy.reset();
    }

    it('should convert class names from UIA to XCUI', async function () {
      await verifyFind('class name', 'UIAButton', 'XCUIElementTypeButton');
      await verifyFind('class name', 'UIAMapView', 'XCUIElementTypeMap');
      await verifyFind('class name', 'UIAScrollView', 'XCUIElementTypeScrollView');
      await verifyFind('class name', 'UIACollectionView', 'XCUIElementTypeCollectionView');
      await verifyFind('class name', 'UIATextView', 'XCUIElementTypeTextView');
      await verifyFind('class name', 'UIAWebView', 'XCUIElementTypeWebView');
    });

    it('should convert xpaths from UIA to XCUI', async function () {
      await verifyFind('xpath', '//UIAButton', '//XCUIElementTypeButton');
      await verifyFind('xpath', '//UIAButton/UIATextField', '//XCUIElementTypeButton/XCUIElementTypeTextField');
      await verifyFind('xpath', 'UIAButton//UIATextField', 'XCUIElementTypeButton//XCUIElementTypeTextField');
      await verifyFind('xpath', '//UIAButton[@name="foo"]', '//XCUIElementTypeButton[@name="foo"]');
      await verifyFind('xpath', '//UIAButton/Weird', '//XCUIElementTypeButton/Weird');
      await verifyFind('xpath', '//UIAMapView/UIAScrollView', '//XCUIElementTypeMap/XCUIElementTypeScrollView');
      await verifyFind(
        'xpath',
        '//UIAMapView/UIAScrollView[@name="UIADummyData"]',
        '//XCUIElementTypeMap/XCUIElementTypeScrollView[@name="UIADummyData"]',
      );
      await verifyFind(
        'xpath',
        '//XCUIElementTypeMap[@name="UIADummyData"]',
        '//XCUIElementTypeMap[@name="UIADummyData"]',
      );
    });

    it('should reject request for first visible child with no context', async function () {
      await assert.rejects(
        driver.findNativeElementOrElements('xpath', '/*[@firstVisible="true"]', false),
        /without a context element/,
      );
    });

    it('should reject request for multiple first visible children', async function () {
      await assert.rejects(
        driver.findNativeElementOrElements('xpath', '/*[@firstVisible="true"]', true),
        /Cannot get multiple/,
      );
    });

    it('should convert magic first visible child xpath to class chain', async function () {
      const variants = ['/*[@firstVisible="true"]', "/*[@firstVisible='true']", "/*[@firstVisible = 'true']"];
      const attribSpy = sinon.stub(driver, 'getAttribute');
      try {
        for (const variant of variants) {
          proxySpy
            .withArgs('/element/ctx/element', 'POST', {using: 'class chain', value: '*[`visible == 1`][1]'})
            .resolves({ELEMENT: 2});
          const el = await driver.findNativeElementOrElements('xpath', variant, false, {
            ELEMENT: 'ctx',
          });
          assert.strictEqual(
            proxySpy.calledOnceWith('/element/ctx/element', 'POST', {
              using: 'class chain',
              value: '*[`visible == 1`][1]',
            }),
            true,
          );
          assert.strictEqual(attribSpy.called, false);
          assert.deepStrictEqual(el, {ELEMENT: 2});
          proxySpy.reset();
        }
      } finally {
        attribSpy.restore();
      }
    });

    it('should throw NoSuchElementError after a single lookup when no child is visible', async function () {
      const attribSpy = sinon.stub(driver, 'getAttribute');
      try {
        proxySpy
          .withArgs('/element/ctx/element', 'POST', {using: 'class chain', value: '*[`visible == 1`][1]'})
          .resolves([]);
        await assert.rejects(
          driver.findNativeElementOrElements('xpath', '/*[@firstVisible="true"]', false, {
            ELEMENT: 'ctx',
          }),
          {name: 'NoSuchElementError'},
        );
        assert.strictEqual(
          proxySpy.calledOnceWith('/element/ctx/element', 'POST', {
            using: 'class chain',
            value: '*[`visible == 1`][1]',
          }),
          true,
        );
        assert.strictEqual(attribSpy.called, false);
      } finally {
        attribSpy.restore();
      }
    });

    it('should convert magic is scrollable xpath to class chain', async function () {
      const multSel =
        '**/*[`type == "XCUIElementTypeScrollView" OR ' +
        'type == "XCUIElementTypeTable" OR ' +
        'type == "XCUIElementTypeCollectionView" OR ' +
        'type == "XCUIElementTypeWebView"`]';
      const singleSel = `${multSel}[1]`;
      await verifyFind('xpath', '//*[@scrollable="true"]', singleSel, 'class chain');
      await verifyFind('xpath', `//*[@scrollable='true']`, singleSel, 'class chain');
      await verifyFind('xpath', `//*[@scrollable = 'true']`, singleSel, 'class chain');
      await verifyFind('xpath', '//*[@scrollable="true"]', multSel, 'class chain', true);
    });
  });

  describe('withoutImplicitWait', function () {
    afterEach(function () {
      driver.implicitWaitMs = 0;
    });

    it('should run the callback with no implicit wait and restore the original value', async function () {
      driver.implicitWaitMs = 700;
      let waitDuringCall: number | null = null;

      const result = await driver.withoutImplicitWait(async () => {
        waitDuringCall = driver.implicitWaitMs;
        return 'done';
      });

      assert.strictEqual(result, 'done');
      assert.strictEqual(waitDuringCall, 0);
      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should restore the original value when the callback throws', async function () {
      driver.implicitWaitMs = 700;

      await assert.rejects(
        driver.withoutImplicitWait(async () => {
          throw new Error('lookup failed');
        }),
        /lookup failed/,
      );

      assert.strictEqual(driver.implicitWaitMs, 700);
    });

    it('should not touch the implicit wait when it is already zero', async function () {
      driver.implicitWaitMs = 0;
      const setImplicitWait = sinon.spy(driver, 'setImplicitWait');
      try {
        assert.strictEqual(await driver.withoutImplicitWait(async () => 'done'), 'done');
        assert.strictEqual(setImplicitWait.callCount, 0);
      } finally {
        setImplicitWait.restore();
      }
    });
  });
});
