import sinon from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';
import {expect} from 'chai';

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
const xmlBody = '<some-xml/>';
const srcTree = `${xmlHeader}${xmlBody}`;

describe('source commands', function () {
  const driver = new XCUITestDriver({} as any);
  const proxyStub = sinon.stub(driver, 'proxyCommand').callsFake(async () => srcTree);

  afterEach(function () {
    proxyStub.resetHistory();
  });

  describe('getPageSource', function () {
    it('should send translated GET request to WDA', async function () {
      await driver.getPageSource();
      expect(proxyStub.calledOnce).to.be.true;
      expect(proxyStub.firstCall.args[0]).to.eql('/source?format=xml&scope=AppiumAUT');
      expect(proxyStub.firstCall.args[1]).to.eql('GET');
    });

    it('should send translated GET request with null excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': null});
      await driver.getPageSource();
      expect(proxyStub.calledOnce).to.be.true;
      expect(proxyStub.firstCall.args[0]).to.eql('/source?format=xml&scope=AppiumAUT');
      expect(proxyStub.firstCall.args[1]).to.eql('GET');
    });

    it('should send translated GET request with empty excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': ''});
      await driver.getPageSource();
      expect(proxyStub.calledOnce).to.be.true;
      expect(proxyStub.firstCall.args[0]).to.eql('/source?format=xml&scope=AppiumAUT');
      expect(proxyStub.firstCall.args[1]).to.eql('GET');
    });

    it('should send translated GET request with single excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': 'visible'});
      await driver.getPageSource();
      expect(proxyStub.calledOnce).to.be.true;
      expect(proxyStub.firstCall.args[0]).to.eql('/source?format=xml&scope=AppiumAUT&excluded_attributes=visible');
      expect(proxyStub.firstCall.args[1]).to.eql('GET');
    });

    it('should send translated GET request with multiple excludedAttributes to WDA', async function () {
      await driver.updateSettings({'pageSourceExcludedAttributes': 'visible,accessible'});
      await driver.getPageSource();
      expect(proxyStub.calledOnce).to.be.true;
      expect(proxyStub.firstCall.args[0]).to.eql('/source?format=xml&scope=AppiumAUT&excluded_attributes=visible%2Caccessible');
      expect(proxyStub.firstCall.args[1]).to.eql('GET');
    });
  });
});
