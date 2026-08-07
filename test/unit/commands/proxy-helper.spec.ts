import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('proxy commands', function () {
  const driver = new XCUITestDriver({} as any);
  driver._wda = {jwproxy: {command: async () => ({})} as any} as any;

  let mockWDProxy: sinon.SinonMock;

  beforeEach(function () {
    mockWDProxy = sinon.mock(driver.wda.jwproxy);
  });

  afterEach(function () {
    mockWDProxy.verify();
  });

  describe('proxyCommand', function () {
    it('should send command through WDA', async function () {
      mockWDProxy.expects('command').once().withExactArgs('/some/endpoint', 'POST', {some: 'stuff'});
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
    });

    it('should throw an error if no endpoint is given', async function () {
      mockWDProxy.expects('command').never().called;
      await assert.rejects(driver.proxyCommand(null as any, 'POST', {some: 'stuff'}), /endpoint/);
    });
    it('should throw an error if no method is given', async function () {
      mockWDProxy.expects('command').never().called;
      await assert.rejects(driver.proxyCommand('/some/endpoint', null as any, {some: 'stuff'}), /GET, POST/);
    });
    it('should throw an error if wda returns an error (even if http status is 200)', async function () {
      mockWDProxy.expects('command').once().returns({status: 13, value: 'WDA error occurred'});
      try {
        await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
      } catch (err) {
        assert.strictEqual((err as any).jsonwpCode, 13);
        assert.ok((err as any).message.includes('WDA error occurred'));
        assert.ok(err instanceof errors.UnknownError);
      }
    });
    it('should not throw an error if no status is returned', async function () {
      mockWDProxy.expects('command').once().returns({value: 'WDA error occurred'});
      await driver.proxyCommand('/some/endpoint', 'POST', {some: 'stuff'});
    });
  });
});
