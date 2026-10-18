import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import {fs} from 'appium/support.js';
import sinon from 'sinon';
import * as teenProcess from 'teen_process';

let process: FakeProcess;
class FakeProcess extends EventEmitter {
  isRunning = false;
  signals: string[] = [];
  failures = 0;
  constructor() {
    super();
    // Expose the fake child process to assertions about shutdown and retries.
    // oxlint-disable-next-line typescript/no-this-alias
    process = this;
  }
  async start(): Promise<void> {
    this.isRunning = true;
    this.emit('line-stderr', 'frame=1');
  }
  async stop(signal: string): Promise<void> {
    this.signals.push(signal);
    if (this.failures-- > 0) {
      throw new Error('Process did not end');
    }
    this.isRunning = false;
  }
}
mock.module('teen_process', {namedExports: {...teenProcess, SubProcess: FakeProcess}});
const {ScreenRecorder} = await import('../../../lib/commands/recordscreen.js');

describe('recording shutdown failures', () => {
  let recorder: InstanceType<typeof ScreenRecorder>;
  beforeEach(async () => {
    sinon.stub(fs, 'which').resolves('/test/ffmpeg');
    recorder = new ScreenRecorder('test', {info() {}, warn() {}}, '/tmp/stop-test.mp4', {
      remoteUrl: 'http://127.0.0.1',
      remotePort: 9100,
      videoScale: '200:300',
    });
    await recorder.start(30000);
  });
  afterEach(async () => {
    process.failures = 0;
    await recorder.interrupt(true);
    sinon.restore();
  });
  it('returns the video after a graceful stop', async () => {
    assert.equal(await recorder.finish(), '/tmp/stop-test.mp4');
    assert.deepEqual(process.signals, ['SIGINT']);
  });
  it('rejects an unfinished video and retains the process for cleanup', async () => {
    process.failures = 1;
    await assert.rejects(recorder.finish(), /failed to stop gracefully/);
    assert.equal(process.isRunning, true);
    assert.equal(await recorder.interrupt(true), true);
    assert.deepEqual(process.signals, ['SIGINT', 'SIGTERM']);
    assert.equal(process.isRunning, false);
  });
  it('does not return a possibly corrupt video after an earlier timeout', async () => {
    process.failures = 1;
    assert.equal(await recorder.interrupt(), false);
    await assert.rejects(recorder.finish(), /failed to stop gracefully/);
    assert.equal(process.isRunning, false);
  });
  it('kills a process that ignores forced termination', async () => {
    process.failures = 1;
    assert.equal(await recorder.interrupt(true), true);
    assert.deepEqual(process.signals, ['SIGTERM', 'SIGKILL']);
    assert.equal(process.isRunning, false);
    await assert.rejects(recorder.finish(), /failed to stop gracefully/);
  });
  it('keeps the handle when even killing fails', async () => {
    process.failures = 2;
    assert.equal(await recorder.interrupt(true), false);
    assert.equal(process.isRunning, true);
    assert.equal(await recorder.interrupt(true), true);
    assert.deepEqual(process.signals, ['SIGTERM', 'SIGKILL', 'SIGTERM']);
  });
});
