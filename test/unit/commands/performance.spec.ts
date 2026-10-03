import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs, tempDir} from 'appium/support.js';
import {createSandbox, type SinonSandbox, type SinonStub} from 'sinon';

import {PerfRecorder} from '../../../lib/commands/performance.js';
import {XCUITestDriver} from '../../../lib/driver.js';

describe('performance commands', function () {
  let sandbox: SinonSandbox;

  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('PerfRecorder.stop', function () {
    let recorder: PerfRecorder;
    let processStopStub: SinonStub;

    beforeEach(function () {
      recorder = new PerfRecorder('/perf-root', '00008120-0000000000000000', {profileName: 'CPU Profiler'});
      processStopStub = sandbox.stub().resolves();
      (recorder as any)._process = {isRunning: true, stop: processStopStub};
      sandbox.stub(recorder, 'getZippedReportPath').resolves('/perf-root.zip');
      sandbox.stub(fs, 'rimraf').resolves();
    });

    it('should wait three minutes for the recording to exit by default', async function () {
      assert.strictEqual(await recorder.stop(), '/perf-root.zip');
      assert.deepStrictEqual(processStopStub.firstCall.args, ['SIGINT', 3 * 60 * 1000]);
    });

    it('should wait for the given timeout', async function () {
      assert.strictEqual(await recorder.stop(false, 10 * 60 * 1000), '/perf-root.zip');
      assert.deepStrictEqual(processStopStub.firstCall.args, ['SIGINT', 10 * 60 * 1000]);
    });

    it('should report the given timeout if the recording does not exit in time', async function () {
      processStopStub.withArgs('SIGINT').rejects(new Error('timeout'));
      await assert.rejects(recorder.stop(false, 1000), /failed to exit after 1000ms/);
      assert.ok(processStopStub.calledWith('SIGKILL'));
    });
  });

  describe('mobile: stopPerfRecord', function () {
    let driver: XCUITestDriver;
    let recorderStopStub: SinonStub;

    beforeEach(async function () {
      driver = new XCUITestDriver({} as any);
      driver._device = {udid: '00008120-0000000000000000', devicectl: {}} as any;
      const resultPath = path.join(await tempDir.openDir(), 'perf.zip');
      await fs.writeFile(resultPath, 'trace');
      recorderStopStub = sandbox.stub().resolves(resultPath);
      driver._perfRecorders = [{profileName: 'CPU Profiler', stop: recorderStopStub} as any];
    });

    it('should pass timeoutMs to the recorder', async function () {
      await driver.execute('mobile: stopPerfRecord', {profileName: 'CPU Profiler', timeoutMs: 600000});
      assert.deepStrictEqual(recorderStopStub.firstCall.args, [false, 600000]);
    });

    it('should keep the default timeout if timeoutMs is not set', async function () {
      await driver.execute('mobile: stopPerfRecord', {profileName: 'CPU Profiler'});
      assert.strictEqual(recorderStopStub.firstCall.args[1], undefined);
    });
  });
});
