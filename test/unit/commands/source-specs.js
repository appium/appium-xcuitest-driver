import sinon from 'sinon';
import XCUITestDriver from '../../..';


const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
const xmlBody = '<some-xml/>';
const srcTree = `${xmlHeader}${xmlBody}`;
const appiumHeadTag = '<AppiumAUT>';
const appiumFootTag = '</AppiumAUT>';

describe('source commands', function () {
  let driver = new XCUITestDriver();
  let proxyStub = sinon.stub(driver, 'proxyCommand').callsFake(async () => srcTree); // eslint-disable-line require-await

  afterEach(function () {
    proxyStub.resetHistory();
  });

  describe('getPageSource', function () {
    it('should send translated GET request to WDA', async function () {
      await driver.getPageSource();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/source');
      proxyStub.firstCall.args[1].should.eql('GET');
    });
    it('should insert received xml into AppiumAUT tags', async function () {
      let src = await driver.getPageSource();
      src.indexOf(xmlHeader).should.eql(0);
      src.indexOf(appiumHeadTag).should.eql(xmlHeader.length);
      src.indexOf(appiumFootTag).should.eql(srcTree.length + appiumHeadTag.length);
    });
  });
});
