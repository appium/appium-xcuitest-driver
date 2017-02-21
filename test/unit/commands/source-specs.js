import sinon from 'sinon';
import XCUITestDriver from '../../..';


const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
const xmlBody = '<some-xml/>';
const srcTree = `${xmlHeader}${xmlBody}`;
const appiumHeadTag = '<AppiumAUT>';
const appiumFootTag = '</AppiumAUT>';

describe('source commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand', async () => { return srcTree; });

  afterEach(() => {
    proxySpy.reset();
  });

  describe('getPageSource', () => {
    it('should send translated GET request to WDA', async () => {
      await driver.getPageSource();
      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/source');
      proxySpy.firstCall.args[1].should.eql('GET');
    });
    it('should insert received xml into AppiumAUT tags', async () => {
      let src = await driver.getPageSource();
      src.indexOf(xmlHeader).should.eql(0);
      src.indexOf(appiumHeadTag).should.eql(xmlHeader.length);
      src.indexOf(appiumFootTag).should.eql(srcTree.length + appiumHeadTag.length);
    });
  });
});
