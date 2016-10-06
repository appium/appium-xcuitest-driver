import sinon from 'sinon';
import XCUITestDriver from '../../..';


describe('general commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.spy(driver, 'proxyCommand');

  afterEach(() => {
    proxySpy.reset();
  });

  describe('findNativeElementOrElements', () => {

    async function verifyFind (strategy, selector, modSelector) {
      try {
        await driver.findNativeElementOrElements(strategy, selector, false);
      } catch (ign) {}
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/element');
      proxySpy.firstCall.args[1].should.eql('POST');
      proxySpy.firstCall.args[2].should.eql({
        using: strategy,
        value: modSelector
      });
      proxySpy.reset();
    }

    it('should convert class names from UIA to XCUI', async () => {
      await verifyFind('class name', 'UIAButton', 'XCUIElementTypeButton');
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
    });
  });
});
