import sinon from 'sinon';
import XCUITestDriver from '../../../lib/driver';

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
      proxyStub.firstCall.args[0].should.eql('/source?format=xml&scope=AppiumAUT');
      proxyStub.firstCall.args[1].should.eql('GET');
    });
  });
});
