import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';

import {SimulatorMediaSource} from '../../../lib/device/media-stream/simulator-source.js';
import {MediaStream} from '../../../lib/device/media-stream/stream.js';

/** Stands in for the video stream of appium-ios-simulator; the test pushes its access units */
function fakeVideoStream() {
  const queue: unknown[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    keyFrameRequests: 0,
    push(sequence: number, isKeyFrame = false) {
      queue.push({track: 'video', data: Buffer.from([sequence]), isKeyFrame, sequence, timestampMicros: sequence});
      wake?.();
    },
    requestKeyFrame() {
      this.keyFrameRequests++;
    },
    async stop() {
      closed = true;
      wake?.();
    },
    async *accessUnits() {
      while (!closed || queue.length) {
        if (!queue.length) {
          await new Promise<void>((resolve) => (wake = resolve));
          continue;
        }
        yield queue.shift();
      }
    },
  };
}

describe('SimulatorMediaSource', function () {
  it('stops the stream that is still being created when stop() is called', async function () {
    let stopped = 0;
    let release!: () => void;
    const sim = {
      startVideoStream: async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return {stop: async () => void stopped++};
      },
    } as any;
    const source = new SimulatorMediaSource(sim, {kind: 'video', batchMs: 0, idleHeartbeatMs: 0});
    const starting = source.start();
    const stopping = source.stop();
    release();
    await Promise.all([starting, stopping]);
    assert.equal(stopped, 1);
    await source.stop();
    assert.equal(stopped, 1);
  });

  it('stops cleanly when start() failed', async function () {
    const sim = {
      startVideoStream: async () => {
        throw new Error('boom');
      },
    } as any;
    const source = new SimulatorMediaSource(sim, {kind: 'video', batchMs: 0, idleHeartbeatMs: 0});
    await assert.rejects(source.start(), /boom/);
    await source.stop();
  });

  it('passes a keyframe request on to a running video stream only', async function () {
    let requests = 0;
    const sim = {
      startVideoStream: async () => ({requestKeyFrame: () => void requests++, stop: async () => {}}),
    } as any;
    const source = new SimulatorMediaSource(sim, {kind: 'video', batchMs: 0, idleHeartbeatMs: 0});
    assert.equal(await source.requestKeyFrame(), false, 'not started yet');
    await source.start();
    assert.equal(await source.requestKeyFrame(), true);
    assert.equal(requests, 1);
    await source.stop();
    assert.equal(await source.requestKeyFrame(), false, 'stopped');
    assert.equal(requests, 1);
  });

  it('has no keyframes to request in a JPEG stream', async function () {
    const sim = {startJpegStream: async () => ({stop: async () => {}})} as any;
    const source = new SimulatorMediaSource(sim, {kind: 'jpeg', batchMs: 0, idleHeartbeatMs: 0});
    await source.start();
    assert.equal(await source.requestKeyFrame(), false);
    await source.stop();
  });

  it('asks the encoder for a keyframe when a subscriber joins a running stream', async function () {
    const video = fakeVideoStream();
    const opts = {kind: 'video' as const, batchMs: 0, idleHeartbeatMs: 0};
    const source = new SimulatorMediaSource({startVideoStream: async () => video} as any, opts);
    const state = {subscribed: false};
    const stream = new MediaStream(source, opts, {
      emit() {},
      emitter: new EventEmitter(),
      hasSubscribers: () => state.subscribed,
      log: {debug() {}, warn() {}, info() {}} as any,
      onEnded() {},
    });
    video.push(0, true);
    await stream.start();
    assert.equal(video.keyFrameRequests, 0);
    state.subscribed = true;
    video.push(1);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(video.keyFrameRequests, 1);
    await stream.stop();
  });
});
