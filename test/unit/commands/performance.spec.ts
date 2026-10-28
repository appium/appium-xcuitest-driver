import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs, tempDir} from 'appium/support.js';
import sinon from 'sinon';

import {PerfRecorder} from '../../../lib/commands/performance.js';
import {XCUITestDriver} from '../../../lib/driver.js';

describe('performance commands', function () {
  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('PerfRecorder.start', function () {
    it('should remove the report root if no recording tool is available', async function () {
      const reportRoot = await tempDir.openDir();
      const recorder = new PerfRecorder(reportRoot, '00008120-0000000000000000', {profileName: 'CPU Profiler'});
      sandbox.stub(fs, 'which').rejects(new Error('not found'));

      await assert.rejects(recorder.start(), /has not been found in PATH/);
      assert.strictEqual(await fs.exists(reportRoot), false);
    });
  });

  describe('mobile: stopPerfRecord', function () {
    let driver: XCUITestDriver;
    let resultPath: string;

    beforeEach(async function () {
      driver = new XCUITestDriver({} as any);
      driver._device = {udid: '00008120-0000000000000000', devicectl: {}} as any;
      resultPath = path.join(await tempDir.openDir(), 'perf.zip');
      await fs.writeFile(resultPath, 'trace');
      driver._perfRecorders = [{profileName: 'CPU Profiler', stop: sandbox.stub().resolves(resultPath)} as any];
    });

    afterEach(async function () {
      await fs.rimraf(path.dirname(resultPath));
    });

    it('should remove the zipped report if the upload fails', async function () {
      await assert.rejects(
        driver.execute('mobile: stopPerfRecord', {
          profileName: 'CPU Profiler',
          remotePath: 'sftp://127.0.0.1/perf.zip',
        }),
        /Unsupported remote protocol/,
      );
      assert.strictEqual(await fs.exists(resultPath), false);
    });
  });
});
