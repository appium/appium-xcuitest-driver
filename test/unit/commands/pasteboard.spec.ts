import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {Simctl} from 'node-simctl';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('pasteboard commands', function () {
  const driver = new XCUITestDriver({} as any);
  let isSimulatorStub: sinon.SinonStub;
  let setPasteboardStub: sinon.SinonStub;
  let getPasteboardStub: sinon.SinonStub;

  beforeEach(function () {
    const simctl = new Simctl();
    setPasteboardStub = sinon.stub(simctl, 'setPasteboard');
    getPasteboardStub = sinon.stub(simctl, 'getPasteboard');
    driver._device = {simctl} as any;
    isSimulatorStub = sinon.stub(driver, 'isSimulator');
  });

  afterEach(function () {
    isSimulatorStub.restore();
    setPasteboardStub.restore();
    getPasteboardStub.restore();
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

    it('setPasteboard should invoke correct simctl method', async function () {
      const content = 'bla';
      const encoding = 'latin1';
      await driver.mobileSetPasteboard(content, encoding);
      assert.strictEqual(setPasteboardStub.calledOnce, true);
      assert.strictEqual(setPasteboardStub.firstCall.args[0], content);
      assert.strictEqual(setPasteboardStub.firstCall.args[1], encoding);
    });

    it('getPasteboard should invoke correct simctl method', async function () {
      const content = 'bla';
      getPasteboardStub.returns(content);
      const result = await driver.mobileGetPasteboard();
      assert.strictEqual(getPasteboardStub.calledOnce, true);
      assert.strictEqual(result, content);
    });
  });
});
