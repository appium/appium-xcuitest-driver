import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

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
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/source?format=xml&scope=AppiumAUT');
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
    });

    it('should send translated GET request with null excludedAttributes to WDA', async function () {
      await driver.updateSettings({pageSourceExcludedAttributes: null});
      await driver.getPageSource();
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/source?format=xml&scope=AppiumAUT');
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
    });

    it('should send translated GET request with empty excludedAttributes to WDA', async function () {
      await driver.updateSettings({pageSourceExcludedAttributes: ''});
      await driver.getPageSource();
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/source?format=xml&scope=AppiumAUT');
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
    });

    it('should send translated GET request with single excludedAttributes to WDA', async function () {
      await driver.updateSettings({pageSourceExcludedAttributes: 'visible'});
      await driver.getPageSource();
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/source?format=xml&scope=AppiumAUT&excluded_attributes=visible');
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
    });

    it('should send translated GET request with multiple excludedAttributes to WDA', async function () {
      await driver.updateSettings({pageSourceExcludedAttributes: 'visible,accessible'});
      await driver.getPageSource();
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(
        proxyStub.firstCall.args[0],
        '/source?format=xml&scope=AppiumAUT&excluded_attributes=visible%2Caccessible',
      );
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
    });
  });
});
