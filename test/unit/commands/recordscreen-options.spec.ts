import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import {fs} from 'appium/support.js';
import sinon from 'sinon';
import * as teenProcess from 'teen_process';

import {MJpegStream} from '../../../lib/commands/helpers/mjpeg.js';

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
mock.module('teen_process', {namedExports: {...teenProcess, SubProcess: FakeProcess}});
const {ScreenRecorder} = await import('../../../lib/commands/recordscreen.js');

describe('recording option compatibility', () => {
  let probe: sinon.SinonStub;
  let recorder: InstanceType<typeof ScreenRecorder>;
  let warn: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(fs, 'which').resolves('/test/ffmpeg');
    probe = sinon.stub(MJpegStream.prototype, 'start').resolves();
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

  it('lets ffmpeg establish the canvas without opening a separate stream', async () => {
    await start();
    sinon.assert.notCalled(probe);
    sinon.assert.notCalled(warn);
    assert.equal(commandArgs[commandArgs.indexOf('-reinit_filter') + 1], '0');
    assert.ok(commandArgs.indexOf('-reinit_filter') < commandArgs.indexOf('-i'));
    assert.equal(commandArgs.filter((arg) => arg === '-vf').length, 1);
    assert.equal(commandArgs[commandArgs.indexOf('-r') + 1], '10');
  });
});
