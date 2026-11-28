import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs} from 'appium/support.js';
import sinon from 'sinon';

import {AudioRecorder} from '../../../lib/commands/record-audio.js';
import {XCUITestDriver} from '../../../lib/driver.js';

describe('audio recording shutdown', function () {
  let sandbox: sinon.SinonSandbox;
  let driver: XCUITestDriver;
  let recorder: AudioRecorder;
  let mainProcess: {isRunning: boolean; stop: sinon.SinonStub};

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    driver = new XCUITestDriver({} as any);
    recorder = new AudioRecorder(':1', driver.log, '/test/audio.mp4');
    mainProcess = {isRunning: true, stop: sandbox.stub()};
    (recorder as any).mainProcess = mainProcess;
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('kills a process that ignores forced termination and keeps its handle until exit', async function () {
    mainProcess.stop.onFirstCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onSecondCall().callsFake(async () => {
      mainProcess.isRunning = false;
    });

    assert.strictEqual(await recorder.interrupt(true), true);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGTERM'], ['SIGKILL']]);
    assert.strictEqual((recorder as any).mainProcess, null);
    assert.strictEqual(recorder.isRecording(), false);
  });

  it('keeps a running process after a failed graceful stop without sending SIGKILL', async function () {
    mainProcess.stop.rejects(new Error('Process did not end'));

    assert.strictEqual(await recorder.interrupt(), false);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT']]);
    assert.strictEqual((recorder as any).mainProcess, mainProcess);
    assert.strictEqual(recorder.isRecording(), true);
  });

  it('clears the process handle after a successful stop', async function () {
    mainProcess.stop.callsFake(async () => {
      mainProcess.isRunning = false;
    });

    assert.strictEqual(await recorder.interrupt(), true);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT']]);
    assert.strictEqual((recorder as any).mainProcess, null);
    assert.strictEqual(recorder.isRecording(), false);
  });

  it('rejects an unfinished audio recording and retains the process for cleanup', async function () {
    mainProcess.stop.onFirstCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onSecondCall().callsFake(async () => {
      mainProcess.isRunning = false;
    });

    await assert.rejects(
      recorder.finish(),
      /Cannot finalize the audio recording because ffmpeg failed to stop gracefully/,
    );
    assert.strictEqual((recorder as any).mainProcess, mainProcess);
    assert.strictEqual(recorder.isRecording(), true);
    assert.strictEqual(await recorder.interrupt(true), true);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT'], ['SIGTERM']]);
    assert.strictEqual((recorder as any).mainProcess, null);
    assert.strictEqual(recorder.isRecording(), false);
  });

  it('does not return a possibly corrupt audio file after an earlier timeout', async function () {
    mainProcess.stop.onFirstCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onSecondCall().callsFake(async () => {
      mainProcess.isRunning = false;
    });

    assert.strictEqual(await recorder.interrupt(), false);
    await assert.rejects(
      recorder.finish(),
      /Cannot finalize the audio recording because ffmpeg failed to stop gracefully/,
    );
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT'], ['SIGINT']]);
    assert.strictEqual(recorder.isRecording(), false);
  });

  it('kills the process and cleans up when stopAudioRecording cannot finalize the recording', async function () {
    mainProcess.stop.onFirstCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onSecondCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onThirdCall().callsFake(async () => {
      mainProcess.isRunning = false;
    });
    sandbox.stub(fs, 'exists').resolves(true);
    const removeStub = sandbox.stub(fs, 'rimraf').resolves();
    const cleanupSpy = sandbox.spy(recorder, 'cleanup');
    driver._audioRecorder = recorder;

    await assert.rejects(driver.stopAudioRecording(), /failed to stop gracefully/);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT'], ['SIGTERM'], ['SIGKILL']]);
    assert.strictEqual(mainProcess.stop.getCall(2).calledBefore(cleanupSpy.getCall(0)), true);
    assert.strictEqual(cleanupSpy.calledOnce, true);
    assert.strictEqual(removeStub.calledOnceWithExactly('/test/audio.mp4'), true);
    assert.strictEqual((recorder as any).mainProcess, null);
    assert.strictEqual(recorder.isRecording(), false);
    assert.strictEqual(driver._audioRecorder, null);
  });

  it('keeps the recorder and its file when stopAudioRecording cannot end ffmpeg, and retries on the next stop', async function () {
    mainProcess.stop.onCall(0).rejects(new Error('Process did not end'));
    mainProcess.stop.onCall(1).rejects(new Error('Process did not end'));
    mainProcess.stop.onCall(2).rejects(new Error('Process did not end'));
    mainProcess.stop.onCall(3).callsFake(async () => {
      mainProcess.isRunning = false;
    });
    sandbox.stub(fs, 'exists').resolves(true);
    const removeStub = sandbox.stub(fs, 'rimraf').resolves();
    driver._audioRecorder = recorder;

    await assert.rejects(driver.stopAudioRecording(), /failed to stop gracefully/);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT'], ['SIGTERM'], ['SIGKILL']]);
    assert.strictEqual(removeStub.called, false);
    assert.strictEqual((recorder as any).mainProcess, mainProcess);
    assert.strictEqual(recorder.isRecording(), true);
    assert.strictEqual(driver._audioRecorder, recorder);

    await assert.rejects(driver.stopAudioRecording(), /failed to stop gracefully/);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGINT'], ['SIGTERM'], ['SIGKILL'], ['SIGINT']]);
    assert.strictEqual(removeStub.calledOnceWithExactly('/test/audio.mp4'), true);
    assert.strictEqual(recorder.isRecording(), false);
    assert.strictEqual(driver._audioRecorder, null);
  });

  it('keeps the handle when even killing fails', async function () {
    mainProcess.stop.onFirstCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onSecondCall().rejects(new Error('Process did not end'));
    mainProcess.stop.onThirdCall().callsFake(async () => {
      mainProcess.isRunning = false;
    });

    assert.strictEqual(await recorder.interrupt(true), false);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGTERM'], ['SIGKILL']]);
    assert.strictEqual((recorder as any).mainProcess, mainProcess);
    assert.strictEqual(recorder.isRecording(), true);

    assert.strictEqual(await recorder.interrupt(true), true);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGTERM'], ['SIGKILL'], ['SIGTERM']]);
    assert.strictEqual((recorder as any).mainProcess, null);
    assert.strictEqual(recorder.isRecording(), false);
  });

  it('does not clean up or start a new recording when forceRestart cannot stop the old one', async function () {
    sandbox.stub(driver, 'isFeatureEnabled').returns(true);
    const startStub = sandbox.stub(AudioRecorder.prototype, 'start').resolves();
    mainProcess.stop.rejects(new Error('Process did not end'));
    const interruptSpy = sandbox.spy(recorder, 'interrupt');
    const cleanupStub = sandbox.stub(recorder, 'cleanup').resolves();
    driver._audioRecorder = recorder;

    await assert.rejects(
      driver.startAudioRecording(':1', 180, 'aac', '128k', 2, 44100, true),
      /Unable to stop audio recording process/,
    );
    assert.strictEqual(interruptSpy.calledOnceWithExactly(true), true);
    assert.deepStrictEqual(mainProcess.stop.args, [['SIGTERM'], ['SIGKILL']]);
    assert.strictEqual((recorder as any).mainProcess, mainProcess);
    assert.strictEqual(cleanupStub.called, false);
    assert.strictEqual(startStub.called, false);
    assert.strictEqual(driver._audioRecorder, recorder);
  });
});
