import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {expect} from 'chai';

describe('general commands', function () {
  const driver = new XCUITestDriver();
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
    async function verifyFind(strategy: string, selector: string, modSelector: string, modStrategy: string | null = null, mult = false) {
      try {
        await driver.findNativeElementOrElements(strategy, selector, mult);
      } catch {}
      expect(proxySpy.calledOnceWith(`/element${mult ? 's' : ''}`, 'POST', {
        using: modStrategy || strategy,
        value: modSelector,
      })).to.be.true;
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
      await verifyFind(
        'xpath',
        '//UIAButton/UIATextField',
        '//XCUIElementTypeButton/XCUIElementTypeTextField',
      );
      await verifyFind(
        'xpath',
        'UIAButton//UIATextField',
        'XCUIElementTypeButton//XCUIElementTypeTextField',
      );
      await verifyFind('xpath', '//UIAButton[@name="foo"]', '//XCUIElementTypeButton[@name="foo"]');
      await verifyFind('xpath', '//UIAButton/Weird', '//XCUIElementTypeButton/Weird');
      await verifyFind(
        'xpath',
        '//UIAMapView/UIAScrollView',
        '//XCUIElementTypeMap/XCUIElementTypeScrollView',
      );
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
      await expect(
        driver.findNativeElementOrElements('xpath', '/*[@firstVisible="true"]', false)
      ).to.be.rejectedWith(/without a context element/);
    });

    it('should reject request for multiple first visible children', async function () {
      await expect(
        driver.findNativeElementOrElements('xpath', '/*[@firstVisible="true"]', true)
      ).to.be.rejectedWith(/Cannot get multiple/);
    });

    it('should convert magic first visible child xpath to class chain', async function () {
      const variants = [
        '/*[@firstVisible="true"]',
        "/*[@firstVisible='true']",
        "/*[@firstVisible = 'true']",
      ];
      const attribSpy = sinon.stub(driver, 'getAttribute');
      for (const variant of variants) {
        proxySpy
          .withArgs('/element/ctx/element', 'POST', {using: 'class chain', value: '*[1]'})
          .resolves({ELEMENT: 1});
        proxySpy
          .withArgs('/element/ctx/element', 'POST', {using: 'class chain', value: '*[2]'})
          .resolves({ELEMENT: 2});
        attribSpy.withArgs('visible', {ELEMENT: 1}).resolves('false');
        attribSpy.withArgs('visible', {ELEMENT: 2}).resolves('true');
        const el = await driver.findNativeElementOrElements('xpath', variant, false, {
          ELEMENT: 'ctx',
        });
        expect(proxySpy.calledTwice).to.be.true;
        expect(proxySpy.calledWith('/element/ctx/element', 'POST', {
          using: 'class chain',
          value: '*[1]',
        })).to.be.true;
        expect(proxySpy.calledWith('/element/ctx/element', 'POST', {
          using: 'class chain',
          value: '*[2]',
        })).to.be.true;
        expect(attribSpy.calledTwice).to.be.true;
        expect(el).to.eql({ELEMENT: 2});
        proxySpy.reset();
        attribSpy.reset();
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
});
