import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('pasteboard commands', function () {
  const driver = new XCUITestDriver({} as any);
  let isSimulatorStub: sinon.SinonStub;
  let setPasteboardStub: sinon.SinonStub;
  let getPasteboardStub: sinon.SinonStub;

  beforeEach(function () {
    setPasteboardStub = sinon.stub().resolves();
    getPasteboardStub = sinon.stub().resolves('');
    driver._device = {setPasteboard: setPasteboardStub, getPasteboard: getPasteboardStub} as any;
    isSimulatorStub = sinon.stub(driver, 'isSimulator');
  });

  afterEach(function () {
    isSimulatorStub.restore();
  });

  describe('real device', function () {
    beforeEach(function () {
      isSimulatorStub.returns(false);
    });

    it('setPasteboard should not be called', async function () {
      await assert.rejects(driver.mobileSetPasteboard({content: 'bla'} as any), /can only be performed on Simulator/);
      assert.strictEqual(setPasteboardStub.notCalled, true);
    });

    it('getPasteboard should not be called', async function () {
      await assert.rejects(driver.mobileGetPasteboard(), /can only be performed on Simulator/);
      assert.strictEqual(getPasteboardStub.notCalled, true);
    });
  });

  describe('simulator', function () {
    beforeEach(function () {
      isSimulatorStub.returns(true);
    });

    it('setPasteboard should fail if no content is provided', async function () {
      await assert.rejects(driver.mobileSetPasteboard(undefined as any), /mandatory to set/);
      assert.strictEqual(setPasteboardStub.notCalled, true);
    });

    it('setPasteboard should invoke setPasteboard with content, ignoring the deprecated encoding option', async function () {
      const content = 'bla';
      await driver.mobileSetPasteboard(content, 'latin1');
      assert.strictEqual(setPasteboardStub.calledOnce, true);
      assert.deepStrictEqual(setPasteboardStub.firstCall.args, [content]);
    });

    it('getPasteboard should invoke getPasteboard, ignoring the deprecated encoding option', async function () {
      const content = 'bla';
      getPasteboardStub.resolves(content);
      const result = await driver.mobileGetPasteboard('latin1');
      assert.strictEqual(getPasteboardStub.calledOnce, true);
      assert.strictEqual(result, content);
    });
  });
});
