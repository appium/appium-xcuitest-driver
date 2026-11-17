import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {SimulatorMediaSource} from '../../../lib/device/media-stream/simulator-source.js';

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
});
