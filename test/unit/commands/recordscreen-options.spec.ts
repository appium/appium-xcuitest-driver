import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import {fs} from 'appium/support.js';
import sinon from 'sinon';
import * as teenProcess from 'teen_process';

const probe = sinon.stub();

let commandArgs: string[];
class FakeProcess extends EventEmitter {
  isRunning = false;
  constructor(_command: string, args: string[]) {
    super();
    commandArgs = args;
  }
  async start(): Promise<void> {
    this.isRunning = true;
    this.emit('line-stderr', 'frame=1');
  }
  async stop(): Promise<void> {
    this.isRunning = false;
  }
}
mock.module('teen_process', {namedExports: {...teenProcess, SubProcess: FakeProcess, exec: probe}});
const {ScreenRecorder} = await import('../../../lib/commands/recordscreen.js');

describe('recording option compatibility', () => {
  let recorder: InstanceType<typeof ScreenRecorder>;
  let warn: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(fs, 'which').resolves('/test/ffmpeg');
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(200, 16);
    png.writeUInt32BE(300, 20);
    probe.reset();
    probe.resolves({stdout: png});
    warn = sinon.stub();
  });
  afterEach(async () => {
    await recorder?.interrupt(true);
    sinon.restore();
  });

  async function start(options = {}): Promise<void> {
    recorder = new ScreenRecorder('test', {info: sinon.stub(), warn}, '/tmp/options-test.mp4', {
      remoteUrl: 'http://127.0.0.1',
      remotePort: 9100,
      videoFps: 10,
      ...options,
    });
    await recorder.start(30000);
  }

  for (const [options, expected] of [
    [{videoFilters: 'transpose=1'}, 'transpose=1'],
    [{videoScale: '320:-2'}, 'scale=320:-2'],
    [{videoFilters: 'transpose=1', videoScale: '320:-2'}, 'transpose=1'],
    [{hardwareAcceleration: 'videoToolbox', videoScale: '320:-2'}, 'scale_vt=320:-2'],
  ] as const) {
    it(`preserves explicit options ${JSON.stringify(options)} without probing`, async () => {
      await start(options);
      assert.equal(commandArgs.filter((arg) => arg === '-vf').length, 1);
      assert.equal(commandArgs[commandArgs.indexOf('-vf') + 1], expected);
      sinon.assert.notCalled(probe);
      assert.ok(!commandArgs.includes('-reinit_filter'));
    });
  }

  it('skips the automatic filter and probe with hardware acceleration', async () => {
    await start({hardwareAcceleration: 'videoToolbox'});
    assert.ok(!commandArgs.includes('-vf'));
    sinon.assert.notCalled(probe);
    assert.ok(!commandArgs.includes('-reinit_filter'));
  });

  it('probes the initial canvas and recalculates padding for each frame', async () => {
    await start();
    sinon.assert.calledOnce(probe);
    assert.ok(commandArgs[commandArgs.indexOf('-vf') + 1].includes('pad=200:300:(ow-iw)/2:(oh-ih)/2:eval=frame'));
    sinon.assert.notCalled(warn);
    assert.equal(commandArgs[commandArgs.indexOf('-reinit_filter') + 1], '0');
    assert.ok(commandArgs.indexOf('-reinit_filter') < commandArgs.indexOf('-i'));
    assert.equal(commandArgs.filter((arg) => arg === '-vf').length, 1);
    assert.equal(commandArgs[commandArgs.indexOf('-r') + 1], '10');
  });
  it('rejects an invalid probe image before starting the recorder', async () => {
    probe.resolves({stdout: Buffer.from('invalid')});
    await assert.rejects(start(), /Cannot determine the recording canvas/);
  });

  it('propagates a bounded probe failure', async () => {
    probe.rejects(new Error('probe timeout'));
    await assert.rejects(start(), /probe timeout/);
    assert.equal(probe.firstCall.args[2].timeout, 10000);
  });
});
