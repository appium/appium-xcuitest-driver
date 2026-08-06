import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('get activeapp commands', function () {
  const driver = new XCUITestDriver({} as any);
  driver._wda = {jwproxy: {command: async () => ({})} as any} as any;
  let proxyStub: sinon.SinonStub;

  beforeEach(function () {
    proxyStub = sinon.stub(driver.wda.jwproxy, 'command' as never);
  });

  afterEach(function () {
    proxyStub.restore();
  });

  it('get active app info', async function () {
    proxyStub.returns({
      pid: 15438,
      name: '',
      bundleId: 'com.apple.DocumentsApp',
      processArguments: {env: {HAPPY: 'testing'}, args: ['happy', 'testing']},
    });

    const out = await driver.mobileGetActiveAppInfo();
    assert.strictEqual(out.pid, 15438);
    assert.strictEqual(out.name, '');
    assert.strictEqual(out.bundleId, 'com.apple.DocumentsApp');
    assert.strictEqual(out.processArguments.env.HAPPY, 'testing');
    assert.strictEqual(out.processArguments.args[0], 'happy');
    assert.strictEqual(out.processArguments.args[1], 'testing');
  });

  it('get active app info raise an error if the endpoint raises error', async function () {
    proxyStub.throws();
    await assert.rejects(driver.mobileGetActiveAppInfo());
  });
});
