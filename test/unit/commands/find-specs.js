import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('findNativeElementOrElements', () => {

    async function verifyFind (strategy, selector, modSelector, modStrategy = null, mult = false) {
      try {
        await driver.findNativeElementOrElements(strategy, selector, mult);
      } catch (ign) {}
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql(`/element${mult ? 's' : ''}`);
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({
        using: modStrategy || strategy,
        value: modSelector
      });
      proxySpy.reset();
    }

    it('should convert class names from UIA to XCUI', async () => {
      await verifyFind('class name', 'UIAButton', 'XCUIElementTypeButton');
      await verifyFind('class name', 'UIAMapView', 'XCUIElementTypeMap');
      await verifyFind('class name', 'UIAScrollView', 'XCUIElementTypeScrollView');
      await verifyFind('class name', 'UIACollectionView', 'XCUIElementTypeCollectionView');
      await verifyFind('class name', 'UIATextView', 'XCUIElementTypeTextView');
      await verifyFind('class name', 'UIAWebView', 'XCUIElementTypeWebView');
    });

    it('should convert xpaths from UIA to XCUI', async () => {
      await verifyFind('xpath', '//UIAButton', '//XCUIElementTypeButton');
      await verifyFind('xpath',
                       '//UIAButton/UIATextField',
                       '//XCUIElementTypeButton/XCUIElementTypeTextField');
      await verifyFind('xpath',
                       'UIAButton//UIATextField',
                       'XCUIElementTypeButton//XCUIElementTypeTextField');
      await verifyFind('xpath',
                       '//UIAButton[@name="foo"]',
                       '//XCUIElementTypeButton[@name="foo"]');
      await verifyFind('xpath',
                       '//UIAButton/Weird',
                       '//XCUIElementTypeButton/Weird');
      await verifyFind('xpath',
                        '//UIAMapView/UIAScrollView',
                        '//XCUIElementTypeMap/XCUIElementTypeScrollView');
      await verifyFind('xpath',
                        '//UIAMapView/UIAScrollView[@name="UIADummyData"]',
                        '//XCUIElementTypeMap/XCUIElementTypeScrollView[@name="UIADummyData"]');
      await verifyFind('xpath',
                        '//XCUIElementTypeMap[@name="UIADummyData"]',
                        '//XCUIElementTypeMap[@name="UIADummyData"]');
    });

    it('should reject request for first visible child with no context', async () => {
      await driver.findNativeElementOrElements(
        'xpath', '/*[@firstVisible="true"]', false)
        .should.eventually.be.rejectedWith(/without a context element/);
    });

    it('should reject request for multiple first visible children', async () => {
      await driver.findNativeElementOrElements(
        'xpath', '/*[@firstVisible="true"]', true)
        .should.eventually.be.rejectedWith(/Cannot get multiple/);
    });

    it('should convert magic first visible child xpath to class chain', async () => {
      const variants = [
        '/*[@firstVisible="true"]',
        "/*[@firstVisible='true']",
        "/*[@firstVisible = 'true']"
      ];
      let attribSpy = sinon.stub(driver, 'getAttribute');
      for (let variant of variants) {
        proxySpy.withArgs(
          '/element/ctx/element',
          'POST',
          {using: 'class chain', value: '*[1]'}
        ).returns({ELEMENT: 1});
        proxySpy.withArgs(
          '/element/ctx/element',
          'POST',
          {using: 'class chain', value: '*[2]'}
        ).returns({ELEMENT: 2});
        attribSpy.withArgs('visible', {ELEMENT: 1}).returns("false");
        attribSpy.withArgs('visible', {ELEMENT: 2}).returns("true");
        let el = await driver.findNativeElementOrElements('xpath',
          variant, false, {ELEMENT: 'ctx'});
        proxySpy.calledTwice.should.be.true;
        proxySpy.firstCall.args[2].should.eql({
          using: 'class chain',
          value: '*[1]',
        });
        proxySpy.secondCall.args[2].should.eql({
          using: 'class chain',
          value: '*[2]',
        });
        attribSpy.calledTwice.should.be.true;
        el.should.eql({ELEMENT: 2});
        proxySpy.reset();
        attribSpy.reset();
      }
    });

    it('should convert magic is scrollable xpath to class chain', async () => {
      const multSel = "**/*[`type == \"XCUIElementTypeScrollView\" OR " +
        "type == \"XCUIElementTypeTable\" OR " +
        "type == \"XCUIElementTypeCollectionView\" OR " +
        "type == \"XCUIElementTypeWebView\"`]";
      const singleSel = `${multSel}[1]`;
      await verifyFind('xpath',
                       '//*[@scrollable="true"]',
                       singleSel,
                       'class chain');
      await verifyFind('xpath',
                       `//*[@scrollable='true']`,
                       singleSel,
                       'class chain');
      await verifyFind('xpath',
                       `//*[@scrollable = 'true']`,
                       singleSel,
                       'class chain');
      await verifyFind('xpath',
                       '//*[@scrollable="true"]',
                       multSel,
                       'class chain',
                       true);
    });
  });
});
