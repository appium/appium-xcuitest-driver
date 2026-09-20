import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';

import sinon from 'sinon';
import * as teenProcessModule from 'teen_process';

// Mocks teen_process's `exec`, which commands/simctl.js calls directly; the driver is imported
// fresh below so this mock is observed (see driver.spec.ts for why).
const defaultExec = async () => ({stdout: '', stderr: '', code: 0});
let currentExec: (...args: any[]) => any = defaultExec;

mock.module('teen_process', {
  namedExports: {
    ...teenProcessModule,
    exec: (...args: any[]) => currentExec(...args),
  },
});

let importCounter = 0;
function importFresh(specifier: string) {
  return import(`${specifier}?mock=${importCounter++}`);
}

const {XCUITestDriver} = await importFresh('../../../lib/driver.js');

describe('general commands', function () {
  const driver = new XCUITestDriver({} as any);
  driver._device = {devicesSetPath: null} as any;

  let execStub: sinon.SinonStub;

  beforeEach(function () {
    execStub = sinon.stub().resolves({stdout: '', stderr: '', code: 0});
    currentExec = execStub;
  });

  afterEach(function () {
    currentExec = defaultExec;
  });

  describe('simctl', function () {
    it('should call xcrun simctl', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      await driver.mobileSimctl('getenv', ['HOME']);
      assert.strictEqual(execStub.calledOnce, true);
      assert.deepStrictEqual(execStub.firstCall.args, [
        'xcrun',
        ['simctl', 'getenv', '60EB8FDB-92E0-4895-B466-0153C6DE7BAE', 'HOME'],
        {timeout: undefined},
      ]);
    });

    it('should call xcrun simctl with timeout', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      await driver.mobileSimctl('getenv', ['HOME'], 10000);
      assert.strictEqual(execStub.calledOnce, true);
      assert.deepStrictEqual(execStub.firstCall.args, [
        'xcrun',
        ['simctl', 'getenv', '60EB8FDB-92E0-4895-B466-0153C6DE7BAE', 'HOME'],
        {timeout: 10000},
      ]);
    });

    it('should raise an error as not supported command', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => true;
      await assert.rejects(driver.mobileSimctl('list', ['devices', 'booted', '--json']));
      assert.strictEqual(execStub.notCalled, true);
    });

    it('should raise an error as no udid', async function () {
      driver.opts.udid = undefined;
      driver.isSimulator = () => true;
      await assert.rejects(driver.mobileSimctl('getenv', ['HOME']));
      assert.strictEqual(execStub.notCalled, true);
    });

    it('should raise an error for non-simulator', async function () {
      driver.opts.udid = '60EB8FDB-92E0-4895-B466-0153C6DE7BAE';
      driver.isSimulator = () => false;
      await assert.rejects(driver.mobileSimctl('getenv', ['HOME']));
      assert.strictEqual(execStub.notCalled, true);
    });
  });
});
