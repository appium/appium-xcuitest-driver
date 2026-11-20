import assert from 'node:assert/strict';
import {describe, it, afterEach, beforeEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('orientation commands', function () {
  const driver = new XCUITestDriver({} as any);
  const proxyStub = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxyStub.resetHistory();
  });

  describe('get/set orientation', function () {
    beforeEach(function () {
      proxyStub.callsFake(async () => 'PORTRAIT');
    });

    it('should send getOrientation request to WDA', async function () {
      const orientation = await driver.getOrientation();
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/orientation');
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
      assert.strictEqual(orientation, 'PORTRAIT');
    });

    it('should send setOrientation request to WDA', async function () {
      await driver.setOrientation('LANDSCAPE');
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/orientation');
      assert.strictEqual(proxyStub.firstCall.args[1], 'POST');
    });
  });

  describe('get/set rotation', function () {
    beforeEach(function () {
      proxyStub.callsFake(async () => ({x: 10, y: 20, z: 30}));
    });

    it('should send getRotation request to WDA', async function () {
      const rotation = await driver.getRotation();
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/rotation');
      assert.strictEqual(proxyStub.firstCall.args[1], 'GET');
      assert.deepStrictEqual(rotation, {x: 10, y: 20, z: 30});
    });

    it('should send setRotation request to WDA', async function () {
      await driver.setRotation(5, 15, 25);
      assert.strictEqual(proxyStub.calledOnce, true);
      assert.strictEqual(proxyStub.firstCall.args[0], '/rotation');
      assert.strictEqual(proxyStub.firstCall.args[1], 'POST');
    });
  });
});
