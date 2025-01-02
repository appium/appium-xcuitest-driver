import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
const xmlBody = '<some-xml/>';
const srcTree = `${xmlHeader}${xmlBody}`;

describe('source commands', function () {
  let driver = new XCUITestDriver();
  let proxyStub = sinon.stub(driver, 'proxyCommand').callsFake(async () => srcTree);

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

    it('should send translated GET request with null excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': null});
      await driver.getPageSource();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/source?format=xml&scope=AppiumAUT');
      proxyStub.firstCall.args[1].should.eql('GET');
    });

    it('should send translated GET request with empty excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': ''});
      await driver.getPageSource();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/source?format=xml&scope=AppiumAUT');
      proxyStub.firstCall.args[1].should.eql('GET');
    });

    it('should send translated GET request with single excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': 'visible'});
      await driver.getPageSource();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/source?format=xml&scope=AppiumAUT&excluded_attributes=visible');
      proxyStub.firstCall.args[1].should.eql('GET');
    });

    it('should send translated GET request with multiple excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': 'visible,accessible'});
      await driver.getPageSource();
      proxyStub.calledOnce.should.be.true;
      proxyStub.firstCall.args[0].should.eql('/source?format=xml&scope=AppiumAUT&excluded_attributes=visible%2Caccessible');
      proxyStub.firstCall.args[1].should.eql('GET');
    });
  });
});
