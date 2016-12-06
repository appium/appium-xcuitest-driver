import sinon from 'sinon';
import XCUITestDriver from '../../..';


const sourceTree = {
  isEnabled: '1',
  isVisible: '1',
  frame: '{{0, 0}, {375, 667}}',
  children: [{
    isEnabled: '1',
    isVisible: '1',
    frame: '{{0, 0}, {375, 667}}',
    children: [],
    rect: { x: 0, y: 0, width: 375, height: 667 },
    value: null,
    label: null,
    type: 'Other',
    name: null,
    rawIdentifier: null
  }],
  rect: { origin: { x: 0, y: 0 }, size: { width: 375, height: 667 } },
  value: null,
  label: 'UICatalog',
  type: 'Application',
  name: 'UICatalog',
  rawIdentifier: null
};

describe('source commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand', async() => { return {tree: sourceTree}; });

  afterEach(() => {
    proxySpy.reset();
  });

  describe('getPageSource', () => {
    it('should send translated POST request to WDA', async () => {
      await driver.getPageSource();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/source');
      proxySpy.firstCall.args[1].should.eql('POST');
    });
  });
});
