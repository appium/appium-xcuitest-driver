import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import {fs} from 'appium/support.js';
import sinon from 'sinon';
import * as teenProcess from 'teen_process';

import {MJpegStream} from '../../../lib/commands/helpers/mjpeg.js';
import * as utils from '../../../lib/utils/index.js';

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
const requireSharp = sinon.stub();
mock.module('teen_process', {namedExports: {...teenProcess, SubProcess: FakeProcess}});
mock.module('../../../lib/utils/index.js', {namedExports: {...utils, requireSharp}});
const {ScreenRecorder} = await import('../../../lib/commands/recordscreen.js');

describe('recording option compatibility', () => {
  let probe: sinon.SinonStub;
  let stopProbe: sinon.SinonStub;
  let recorder: InstanceType<typeof ScreenRecorder>;
  let warn: sinon.SinonStub;
  let frame: string | null;

  beforeEach(() => {
    sinon.stub(fs, 'which').resolves('/test/ffmpeg');
    probe = sinon.stub(MJpegStream.prototype, 'start').resolves();
    stopProbe = sinon.stub(MJpegStream.prototype, 'stop');
    frame = 'ZmFrZQ==';
    sinon.stub(MJpegStream.prototype, 'lastChunkBase64').get(() => frame);
    requireSharp.reset();
    requireSharp.resolves(() => ({metadata: async () => ({autoOrient: {width: 200, height: 300}})}));
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
      sinon.assert.notCalled(requireSharp);
    });
  }

  it('skips the automatic filter and probe with hardware acceleration', async () => {
    await start({hardwareAcceleration: 'videoToolbox'});
    assert.ok(!commandArgs.includes('-vf'));
    sinon.assert.notCalled(probe);
    sinon.assert.notCalled(requireSharp);
  });

  for (const failure of ['connection', 'missing frame', 'missing sharp', 'invalid image', 'invalid dimensions']) {
    it(`starts ffmpeg without an automatic filter after ${failure}`, async () => {
      if (failure === 'connection') {
        probe.rejects(new Error('Probe connection failed'));
      } else if (failure === 'missing frame') {
        frame = null;
      } else if (failure === 'missing sharp') {
        requireSharp.rejects(new Error('sharp is unavailable'));
      } else if (failure === 'invalid image') {
        requireSharp.resolves(() => ({
          metadata: async () => {
            throw new Error('Invalid JPEG');
          },
        }));
      } else {
        requireSharp.resolves(() => ({metadata: async () => ({autoOrient: {width: 0, height: 300}})}));
      }
      await start();
      assert.ok(!commandArgs.includes('-vf'));
      assert.equal(commandArgs[commandArgs.indexOf('-r') + 1], '10');
      assert.ok(commandArgs.includes('http://127.0.0.1:9100'));
      sinon.assert.calledOnce(stopProbe);
      sinon.assert.calledOnce(warn);
    });
  }
});
