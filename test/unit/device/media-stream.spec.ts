import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, it, mock} from 'node:test';

import type {BiDiEvent} from '@appium/types';

import {UnitBatcher} from '../../../lib/device/media-stream/batcher.js';
import {readJpegSize} from '../../../lib/device/media-stream/jpeg.js';
import {MediaStream, parseAdtsFormat} from '../../../lib/device/media-stream/stream.js';
import type {MediaSource, MediaUnit, SourceUnit} from '../../../lib/device/media-stream/types.js';

const log = {debug() {}, warn() {}, info() {}} as any;
const START = Buffer.from([0, 0, 0, 1]);
// An H.264 keyframe: SPS (high 1080x1920 cropped) + PPS + IDR, as the sources deliver it
const SPS = Buffer.from('67640028acd9404403c797c044000003000400000300283c60c658', 'hex');
const keyFrameData = (tail = 'IDR') =>
  Buffer.concat([START, SPS, START, Buffer.from([0x68, 0xce, 0x3c]), START, Buffer.from(tail)]);

function unit(track: MediaUnit['track'], seq: number, key = false): MediaUnit {
  return {track, seq, ts: seq, key, data: Buffer.from([seq])};
}

function su(track: SourceUnit['track'], sequence: number, extra: Partial<SourceUnit> = {}): SourceUnit {
  return {track, data: Buffer.from([sequence]), sequence, timestampMicros: sequence, isKeyFrame: false, ...extra};
}

/** Fake source whose units are pushed by the test */
function fakeSource() {
  const queue: SourceUnit[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const source: MediaSource & {keyFrameRequests: number; stops: number; push(u: SourceUnit): void} = {
    keyFrameRequests: 0,
    stops: 0,
    push(item: SourceUnit) {
      queue.push(item);
      wake?.();
    },
    async start() {},
    async stop() {
      this.stops++;
      closed = true;
      wake?.();
    },
    async requestKeyFrame() {
      this.keyFrameRequests++;
      return true;
    },
    async *units() {
      while (!closed || queue.length) {
        if (!queue.length) {
          await new Promise<void>((r) => (wake = r));
          continue;
        }
        yield queue.shift() as SourceUnit;
      }
    },
  };
  return source;
}

function setup(kind: 'video' | 'jpeg', subscribed = true, extra: Record<string, unknown> = {}) {
  const source = fakeSource();
  const events: BiDiEvent[] = [];
  const state = {subscribed};
  const emitter = new EventEmitter();
  const stream = new MediaStream(
    source,
    {kind, batchMs: 0, idleHeartbeatMs: 0, ...extra},
    {emit: (e) => events.push(e), emitter, hasSubscribers: () => state.subscribed, log, onEnded() {}},
  );
  const tick = () => new Promise((r) => setImmediate(r));
  // A video stream is only started once the encoder produced its first keyframe
  const begin = async () => {
    if (kind === 'video') {
      source.push(su('video', 0, {isKeyFrame: true, data: keyFrameData()}));
    }
    return await stream.start();
  };
  return {source, events, state, emitter, stream, tick, begin};
}

const unitEvents = (events: BiDiEvent[]) => events.filter((e) => e.method === 'appium:mediaStream.units');
// The stream reads performance.now(), which mock.timers cannot mock, so it follows the mocked Date instead
const mockClock = () => {
  mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1_000_000});
  mock.method(performance, 'now', () => Date.now());
};
const restoreClock = () => {
  mock.timers.reset();
  mock.restoreAll();
};
const sof = (width: number, height: number) =>
  Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);

describe('UnitBatcher', function () {
  it('cuts batches at video keyframes and track changes', function () {
    const batches: MediaUnit[][] = [];
    const b = new UnitBatcher(1000, (u) => batches.push(u));
    b.push(unit('video', 1, true));
    b.push(unit('video', 2));
    b.push(unit('video', 3, true));
    b.push(unit('audio', 1, true));
    b.push(unit('audio', 2, true));
    b.flush();
    assert.deepEqual(
      batches.map((x) => x.map((u) => `${u.track}${u.seq}`)),
      [['video1', 'video2'], ['video3'], ['audio1', 'audio2']],
    );
    b.close();
  });

  it('batches interleaved tracks independently', function () {
    const batches: MediaUnit[][] = [];
    const b = new UnitBatcher(1000, (u) => batches.push(u));
    b.push(unit('video', 1, true));
    b.push(unit('audio', 1, true));
    b.push(unit('video', 2));
    b.push(unit('audio', 2, true));
    b.flush();
    assert.deepEqual(
      batches.map((x) => x.map((u) => `${u.track}${u.seq}`)),
      [
        ['video1', 'video2'],
        ['audio1', 'audio2'],
      ],
    );
    b.close();
  });

  it('does not batch jpeg frames', function () {
    const batches: MediaUnit[][] = [];
    const b = new UnitBatcher(1000, (u) => batches.push(u));
    b.push(unit('jpeg', 1, true));
    b.push(unit('jpeg', 2, true));
    assert.equal(batches.length, 2);
  });
});

describe('readJpegSize', function () {
  it('reads dimensions from SOF0', function () {
    assert.deepEqual(readJpegSize(sof(400, 800)), {width: 400, height: 800});
  });

  it('returns null for garbage', function () {
    assert.equal(readJpegSize(Buffer.from([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  });
});

describe('parseAdtsFormat', function () {
  it('reads sample rate and channels (48 kHz stereo, as CoreSimulator emits)', function () {
    const header = Buffer.from([0xff, 0xf1, 0x4c, 0x80, 0x01, 0x3f, 0xfc]);
    assert.deepEqual(parseAdtsFormat(header), {sampleRate: 48000, channels: 2});
  });

  it('returns undefined for anything else', function () {
    assert.equal(parseAdtsFormat(Buffer.from([1, 2, 3, 4, 5, 6, 7])), undefined);
  });
});

describe('MediaStream', function () {
  it('announces the size read from the first keyframe and forwards the keyframe as is', async function () {
    const {source, events, stream, tick, begin} = setup('video');
    const info = await begin();
    assert.deepEqual([info.width, info.height, info.codec, info.tracks], [1080, 1920, 'h264', ['video']]);
    source.push(su('video', 1));
    await tick();
    const evs = unitEvents(events);
    assert.deepEqual(evs[0].delivery, {policy: 'droppable', chain: `${stream.streamId}:video`, syncPoint: true});
    assert.deepEqual(Buffer.from(evs[0].params!.units[0].data, 'base64'), keyFrameData());
    assert.equal(evs[1].delivery?.syncPoint, false);
    assert.equal(events.filter((e) => e.method === 'appium:mediaStream.started').length, 1);
    await stream.stop();
    const media = events.filter((e) => e.method.startsWith('appium:mediaStream.'));
    assert.ok(media.length > 1);
    assert.ok(media.every((e) => e.context === 'NATIVE_APP'));
  });

  it('flushes the pending batch when the source ends', async function () {
    const {source, events, stream, tick, begin} = setup('video', true, {batchMs: 1000});
    await begin();
    source.push(su('video', 1));
    await source.stop();
    await tick();
    await tick();
    assert.ok(stream.isStopped);
    const sent = unitEvents(events).flatMap((e) => e.params!.units.map((u: {seq: number}) => u.seq));
    assert.equal(sent.length, 2);
  });

  it('flushes the pending batch before `ended` on an explicit stop', async function () {
    const {source, events, stream, tick, begin} = setup('video', true, {batchMs: 1000});
    await begin();
    source.push(su('video', 1));
    await tick();
    await stream.stop();
    const methods = events.map((e) => e.method);
    assert.equal(methods.at(-1), 'appium:mediaStream.ended');
    const sent = unitEvents(events).flatMap((e) => e.params!.units.map((u: {seq: number}) => u.seq));
    assert.equal(sent.length, 2);
  });

  it('does not announce or finish starting on a delta frame', async function () {
    const {source, events, stream} = setup('video');
    source.push(su('video', 0));
    const starting = stream.start();
    await source.stop();
    await assert.rejects(starting, /ended before producing any output/);
    assert.deepEqual(
      events.filter((e) => e.method.startsWith('appium:mediaStream.') && !e.method.endsWith('.units')),
      [],
    );
    assert.equal(unitEvents(events).length, 0);
  });

  it('calls onEnded once when the stream ends', async function () {
    const ended: string[] = [];
    const source = fakeSource();
    const stream = new MediaStream(
      source,
      {kind: 'video', batchMs: 0, idleHeartbeatMs: 0},
      {emit() {}, emitter: new EventEmitter(), hasSubscribers: () => true, log, onEnded: (id) => ended.push(id)},
    );
    source.push(su('video', 0, {isKeyFrame: true, data: keyFrameData()}));
    await stream.start();
    await stream.stop();
    await stream.stop();
    assert.deepEqual(ended, [stream.streamId]);
  });

  it('announces a format change when a later keyframe has another size', async function () {
    const {source, events, stream, tick, begin} = setup('video');
    await begin();
    const formatEvents = () => events.filter((e) => e.method === 'appium:mediaStream.formatChanged');
    assert.equal(formatEvents().length, 0);
    // Same size again: nothing is announced
    source.push(su('video', 1, {isKeyFrame: true, data: keyFrameData('B')}));
    await tick();
    assert.equal(formatEvents().length, 0);
    const sps640x480 = Buffer.from('677a0016bcd940a03db0110000030001000003000a0f162d96', 'hex');
    source.push(
      su('video', 2, {isKeyFrame: true, data: Buffer.concat([START, sps640x480, START, Buffer.from('IDR')])}),
    );
    await tick();
    assert.deepEqual(
      formatEvents().map((e) => e.params),
      [{streamId: stream.streamId, width: 640, height: 480}],
    );
    await stream.stop();
  });

  it('waits for a keyframe after the subscriber appears', async function () {
    const {source, events, state, stream, tick, begin} = setup('video', false);
    await begin();
    source.push(su('video', 1, {isKeyFrame: true, data: keyFrameData()}));
    await tick();
    state.subscribed = true;
    source.push(su('video', 2));
    source.push(su('video', 3, {isKeyFrame: true, data: keyFrameData()}));
    await tick();
    assert.deepEqual(
      unitEvents(events).map((e) => e.params!.units[0].seq),
      [3],
    );
    await stream.stop();
  });

  it('marks audio reliable, always key, and reports its format in info', async function () {
    const {source, events, stream, tick, begin} = setup('video', true, {audio: true});
    await begin();
    source.push(su('audio', 1, {data: Buffer.from([0xff, 0xf1, 0x4c, 0x80, 0x01, 0x3f, 0xfc])}));
    await tick();
    const audio = unitEvents(events).find((e) => e.params!.units[0].track === 'audio');
    assert.deepEqual(audio?.delivery, {policy: 'reliable'});
    assert.equal(audio?.params!.units[0].key, true);
    assert.deepEqual(stream.info().audio, {sampleRate: 48000, channels: 2});
    await stream.stop();
  });

  it('emits one droppable jpeg per event and replays the last one when idle', async function () {
    const {source, events, stream, tick} = setup('jpeg', true, {idleHeartbeatMs: 20});
    await stream.start();
    source.push(su('jpeg', 5, {data: sof(8, 16), isKeyFrame: true}));
    await tick();
    assert.deepEqual(unitEvents(events)[0].delivery, {policy: 'droppable'});
    assert.deepEqual(events.find((e) => e.method === 'appium:mediaStream.formatChanged')?.params, {
      streamId: stream.streamId,
      width: 8,
      height: 16,
    });
    await new Promise((r) => setTimeout(r, 80));
    const evs = unitEvents(events);
    assert.ok(evs.length >= 2, 'heartbeat re-emits the last frame');
    assert.deepEqual(
      evs.map((e) => e.params!.units[0].seq),
      evs.map((_, i) => i),
    );
    await stream.stop();
  });

  it('reports backpressure drops in the next units event and emits ended once', async function () {
    const {source, events, emitter, stream, tick} = setup('jpeg');
    await stream.start();
    emitter.emit('bidiBackpressure', {method: 'appium:mediaStream.units', state: 'dropping', dropped: 4});
    source.push(su('jpeg', 0, {isKeyFrame: true}));
    await tick();
    assert.equal(unitEvents(events)[0].params!.dropped, 4);
    await stream.stop();
    await stream.stop();
    assert.equal(events.filter((e) => e.method === 'appium:mediaStream.ended').length, 1);
    assert.equal(emitter.listenerCount('bidiBackpressure'), 0);
  });

  it('requests a keyframe when a subscriber appears and when core starts dropping, rate-limited', async function () {
    const {source, state, emitter, stream, tick, begin} = setup('video', false);
    await begin();
    source.push(su('video', 1, {isKeyFrame: true, data: keyFrameData()}));
    await tick();
    assert.equal(source.keyFrameRequests, 0);
    state.subscribed = true;
    source.push(su('video', 2));
    await tick();
    assert.equal(source.keyFrameRequests, 1);
    emitter.emit('bidiBackpressure', {
      method: 'appium:mediaStream.units',
      chain: `${stream.streamId}:video`,
      state: 'dropping',
      dropped: 1,
    });
    assert.equal(source.keyFrameRequests, 1, 'rate-limited within the minimum interval');
    await stream.stop();
  });

  it('works with sources that cannot request keyframes', async function () {
    const {source, state, stream, tick, begin} = setup('video', false);
    delete (source as any).requestKeyFrame;
    await begin();
    state.subscribed = true;
    source.push(su('video', 1));
    await tick();
    await stream.stop();
  });

  it('ignores backpressure of other streams', async function () {
    const video = setup('video');
    await video.begin();
    video.emitter.emit('bidiBackpressure', {method: 'appium:mediaStream.units', state: 'dropping', dropped: 3});
    video.emitter.emit('bidiBackpressure', {
      method: 'appium:mediaStream.units',
      chain: 'other:video',
      state: 'dropping',
      dropped: 3,
    });
    assert.equal(video.source.keyFrameRequests, 0);
    video.source.push(su('video', 1, {isKeyFrame: true, data: keyFrameData()}));
    await video.tick();
    assert.equal(unitEvents(video.events)[0].params!.dropped, 0);
    await video.stream.stop();
  });

  it('fails to start and stops the source if no video unit arrives', async function () {
    const {source, stream} = setup('video');
    const starting = stream.start();
    // The source ends right away, e.g. the encoder rejected the configuration
    await source.stop();
    await assert.rejects(starting, /ended before producing any output/);
    assert.equal(source.stops >= 1, true);
  });

  it('ends with the reason when the source fails', async function () {
    const {events, stream, tick} = setup('jpeg');
    const failing: MediaSource = {
      async start() {},
      async stop() {},
      async *units() {
        yield su('jpeg', 0, {isKeyFrame: true});
        throw new Error('encoder died');
      },
    };
    const failed = new MediaStream(
      failing,
      {kind: 'jpeg', batchMs: 0, idleHeartbeatMs: 0},
      {
        emit: (e) => events.push(e),
        emitter: new EventEmitter(),
        hasSubscribers: () => true,
        log,
        onEnded() {},
      },
    );
    await failed.start();
    await tick();
    await failed.stop();
    assert.equal(events.find((e) => e.method === 'appium:mediaStream.ended')?.params?.reason, 'error: encoder died');
    await stream.stop();
  });
});

describe('MediaStream with a hung source', function () {
  const hang = () => new Promise<void>(() => {});

  it('stops without waiting for a slow source, and releases the stream only once it has stopped', async function () {
    mock.timers.enable({apis: ['setTimeout']});
    try {
      const source = fakeSource();
      let finishStop!: () => void;
      source.stop = () => new Promise<void>((resolve) => (finishStop = resolve));
      const ended: string[] = [];
      const stream = new MediaStream(source, {kind: 'jpeg', batchMs: 0, idleHeartbeatMs: 0} as any, {
        emit() {},
        emitter: new EventEmitter(),
        hasSubscribers: () => true,
        log,
        onEnded: (id) => ended.push(id),
      });
      await stream.start();
      const stopped = stream.stop();
      // First the source stop times out, then the wait for the pump that never ends
      for (let i = 0; i < 2; i++) {
        await new Promise((r) => setImmediate(r));
        mock.timers.tick(15_000);
      }
      await stopped;
      assert.deepEqual(ended, []);
      finishStop();
      await new Promise((r) => setImmediate(r));
      assert.deepEqual(ended, [stream.streamId]);
    } finally {
      mock.timers.reset();
    }
  });

  it('fails to start if the source never starts', async function () {
    mock.timers.enable({apis: ['setTimeout']});
    try {
      const source = fakeSource();
      source.start = hang;
      source.stop = hang;
      const stream = new MediaStream(source, {kind: 'jpeg', batchMs: 0, idleHeartbeatMs: 0} as any, {
        emit() {},
        emitter: new EventEmitter(),
        hasSubscribers: () => true,
        log,
        onEnded() {},
      });
      const started = assert.rejects(stream.start(), /did not start within 60000ms/);
      await new Promise((r) => setImmediate(r));
      mock.timers.tick(60_000);
      // Then the stop of the source that never started is bounded too
      await new Promise((r) => setImmediate(r));
      mock.timers.tick(15_000);
      await started;
    } finally {
      mock.timers.reset();
    }
  });
});

describe('MediaStream late subscriber', function () {
  // The limit of one keyframe request per second reads the clock and delays a request that comes sooner
  beforeEach(mockClock);
  afterEach(restoreClock);

  const audio = (sequence: number) =>
    su('audio', sequence, {isKeyFrame: true, data: Buffer.from([0xff, 0xf1, 0x4c, 0x80, 0x01, 0x3f, 0xfc])});
  const keyFrame = (sequence: number) => su('video', sequence, {isKeyFrame: true, data: keyFrameData()});
  const sent = (events: BiDiEvent[]) =>
    unitEvents(events).flatMap((e) => e.params!.units.map((u: {track: string; seq: number}) => `${u.track}${u.seq}`));
  // The subscriber leaves for one audio unit and is back for the next one
  const leaveAndReturn = async ({source, state, tick}: ReturnType<typeof setup>, sequence: number) => {
    state.subscribed = false;
    source.push(audio(sequence));
    await tick();
    state.subscribed = true;
    source.push(audio(sequence + 1));
    await tick();
  };

  it('asks once when the first unit after the subscription is audio, however many follow', async function () {
    const {source, events, state, stream, tick, begin} = setup('video', false, {audio: true});
    await begin();
    state.subscribed = true;
    for (let i = 1; i <= 100; i++) {
      source.push(audio(i));
    }
    source.push(su('video', 1));
    await tick();
    assert.equal(source.keyFrameRequests, 1);
    // The request is made when the subscriber appears, not repeated while the keyframe is awaited
    mock.timers.tick(5000);
    source.push(audio(101));
    source.push(su('video', 2));
    await tick();
    assert.equal(source.keyFrameRequests, 1);
    // Audio is delivered from the start, video only from the keyframe on
    assert.equal(sent(events).length, 101);
    assert.ok(sent(events).every((u) => u.startsWith('audio')));
    source.push(keyFrame(3));
    source.push(su('video', 4));
    await tick();
    assert.deepEqual(sent(events).slice(-2), ['video3', 'video4']);
    assert.equal(source.keyFrameRequests, 1);
    await stream.stop();
  });

  it('asks once when the first unit after the subscription is a video delta', async function () {
    const {source, events, state, stream, tick, begin} = setup('video', false, {audio: true});
    await begin();
    state.subscribed = true;
    source.push(su('video', 1));
    source.push(audio(1));
    source.push(su('video', 2));
    await tick();
    assert.equal(source.keyFrameRequests, 1);
    assert.deepEqual(sent(events), ['audio1']);
    await stream.stop();
  });

  it('does not ask when the first unit after the subscription is a video keyframe', async function () {
    const {source, events, state, stream, tick, begin} = setup('video', false, {audio: true});
    await begin();
    state.subscribed = true;
    source.push(keyFrame(1));
    source.push(audio(1));
    source.push(su('video', 2));
    await tick();
    assert.equal(source.keyFrameRequests, 0);
    assert.deepEqual(sent(events), ['video1', 'audio1', 'video2']);
    await stream.stop();
  });

  it('does not ask at the start of a stream with audio whose client subscribed first', async function () {
    const {source, events, stream, tick, begin} = setup('video', true, {audio: true});
    // Audio that arrives before the first keyframe is dropped, since `started` is not sent yet
    source.push(audio(0));
    source.push(audio(1));
    await begin();
    source.push(audio(2));
    source.push(su('video', 1));
    source.push(audio(3));
    await tick();
    assert.equal(source.keyFrameRequests, 0);
    assert.deepEqual(sent(events), ['video0', 'audio2', 'video1', 'audio3']);
    await stream.stop();
  });

  it('asks again for a subscriber that left and came back, once the rate limit allows', async function () {
    const s = setup('video', true, {audio: true});
    await s.begin();
    await leaveAndReturn(s, 1);
    assert.equal(s.source.keyFrameRequests, 1);
    s.source.push(keyFrame(1));
    await s.tick();
    await leaveAndReturn(s, 3);
    assert.equal(s.source.keyFrameRequests, 1, 'less than a second after the previous request');
    mock.timers.tick(999);
    assert.equal(s.source.keyFrameRequests, 1);
    mock.timers.tick(1);
    assert.equal(s.source.keyFrameRequests, 2, 'sent as soon as the second has passed');
    mock.timers.tick(5000);
    assert.equal(s.source.keyFrameRequests, 2, 'sent once');
    await s.stream.stop();
  });

  it('drops a request waiting for the rate limit once a keyframe reaches the subscriber', async function () {
    const s = setup('video', true, {audio: true});
    await s.begin();
    await leaveAndReturn(s, 1);
    await leaveAndReturn(s, 3);
    s.source.push(keyFrame(1));
    await s.tick();
    mock.timers.tick(1000);
    assert.equal(s.source.keyFrameRequests, 1);
    await s.stream.stop();
  });

  it('drops a request waiting for the rate limit when the subscriber leaves or the stream stops', async function () {
    const s = setup('video', true, {audio: true});
    await s.begin();
    await leaveAndReturn(s, 1);
    await leaveAndReturn(s, 3);
    s.state.subscribed = false;
    mock.timers.tick(1000);
    assert.equal(s.source.keyFrameRequests, 1, 'nobody is subscribed any more');
    await leaveAndReturn(s, 5);
    assert.equal(s.source.keyFrameRequests, 2);
    await leaveAndReturn(s, 7);
    await s.stream.stop();
    mock.timers.tick(1000);
    assert.equal(s.source.keyFrameRequests, 2, 'the stream has stopped');
  });

  it('sends a backpressure request that comes within the rate limit once the second has passed', async function () {
    const s = setup('video', true, {audio: true});
    await s.begin();
    await leaveAndReturn(s, 1);
    assert.equal(s.source.keyFrameRequests, 1);
    mock.timers.tick(500);
    s.emitter.emit('bidiBackpressure', {
      method: 'appium:mediaStream.units',
      chain: `${s.stream.streamId}:video`,
      state: 'dropping',
      dropped: 1,
    });
    assert.equal(s.source.keyFrameRequests, 1);
    mock.timers.tick(500);
    assert.equal(s.source.keyFrameRequests, 2);
    await s.stream.stop();
  });

  it('treats a subscriber that comes back before the next unit as a late joiner after a waiting request found nobody', async function () {
    const s = setup('video', true, {audio: true});
    await s.begin();
    await leaveAndReturn(s, 1);
    s.source.push(keyFrame(1));
    await s.tick();
    s.emitter.emit('bidiBackpressure', {
      method: 'appium:mediaStream.units',
      chain: `${s.stream.streamId}:video`,
      state: 'dropping',
      dropped: 1,
    });
    s.state.subscribed = false;
    mock.timers.tick(1000);
    assert.equal(s.source.keyFrameRequests, 1, 'nobody is subscribed when the second has passed');
    s.state.subscribed = true;
    const before = sent(s.events).length;
    s.source.push(su('video', 2));
    s.source.push(keyFrame(3));
    await s.tick();
    assert.equal(s.source.keyFrameRequests, 2);
    assert.deepEqual(sent(s.events).slice(before), ['video3'], 'no delta frame before the keyframe');
    await s.stream.stop();
  });

  it('asks right away while the clock still reads less than a second', async function () {
    // performance.now() counts from the process start
    mock.timers.setTime(0);
    const s = setup('video', true, {audio: true});
    await s.begin();
    await leaveAndReturn(s, 1);
    assert.equal(s.source.keyFrameRequests, 1);
    await s.stream.stop();
  });

  it('still asks when core starts dropping units of a stream with audio', async function () {
    const {source, emitter, stream, tick, begin} = setup('video', true, {audio: true});
    await begin();
    source.push(audio(1));
    await tick();
    assert.equal(source.keyFrameRequests, 0);
    emitter.emit('bidiBackpressure', {
      method: 'appium:mediaStream.units',
      chain: `${stream.streamId}:video`,
      state: 'dropping',
      dropped: 2,
    });
    source.push(audio(2));
    await tick();
    assert.equal(source.keyFrameRequests, 1);
    await stream.stop();
  });

  it('never asks for a JPEG stream', async function () {
    const {source, events, state, emitter, stream, tick} = setup('jpeg', false);
    await stream.start();
    source.push(su('jpeg', 0, {isKeyFrame: true}));
    await tick();
    state.subscribed = true;
    source.push(su('jpeg', 1, {isKeyFrame: true}));
    emitter.emit('bidiBackpressure', {method: 'appium:mediaStream.units', state: 'dropping', dropped: 1});
    await tick();
    assert.equal(source.keyFrameRequests, 0);
    assert.equal(unitEvents(events).length, 1);
    await stream.stop();
  });
});

describe('MediaStream with keyFrameIntervalMs', function () {
  beforeEach(mockClock);
  afterEach(restoreClock);

  const advance = async (ms: number) => {
    for (let passed = 0; passed < ms; passed += 50) {
      mock.timers.tick(50);
      await new Promise((r) => setImmediate(r));
    }
  };
  // An encoder that answers every request with a keyframe, also when the screen is static
  const answerRequests = (source: ReturnType<typeof fakeSource>) => {
    let sequence = 100;
    source.requestKeyFrame = async () => {
      source.keyFrameRequests++;
      source.push(su('video', sequence++, {isKeyFrame: true, data: keyFrameData()}));
      return true;
    };
  };
  const keyFramesSent = (events: BiDiEvent[]) =>
    unitEvents(events).flatMap((e) => e.params!.units.filter((u: {key: boolean}) => u.key)).length;

  it('asks for a keyframe each time the last one sent is older than the interval, also on a static screen', async function () {
    const {source, events, stream, begin} = setup('video', true, {keyFrameIntervalMs: 4000});
    answerRequests(source);
    await begin();
    await advance(3950);
    assert.equal(source.keyFrameRequests, 0);
    await advance(100);
    assert.equal(source.keyFrameRequests, 1);
    await advance(12_000);
    assert.equal(source.keyFrameRequests, 4);
    assert.equal(keyFramesSent(events), 5);
    await stream.stop();
  });

  it('counts the keyframes that the encoder sends by itself', async function () {
    const {source, stream, begin} = setup('video', true, {keyFrameIntervalMs: 4000});
    answerRequests(source);
    await begin();
    await advance(3000);
    source.push(su('video', 1, {isKeyFrame: true, data: keyFrameData()}));
    await advance(3950);
    assert.equal(source.keyFrameRequests, 0);
    await advance(100);
    assert.equal(source.keyFrameRequests, 1);
    await stream.stop();
  });

  it('asks again at most once a second while no keyframe arrives', async function () {
    const {source, stream, begin} = setup('video', true, {keyFrameIntervalMs: 2000});
    await begin();
    await advance(2000);
    assert.equal(source.keyFrameRequests, 1);
    await advance(3100);
    assert.equal(source.keyFrameRequests, 4);
    await stream.stop();
  });

  it('does not ask while nobody is subscribed, and asks once a subscriber appears', async function () {
    const {source, events, state, stream, begin} = setup('video', false, {keyFrameIntervalMs: 2000});
    answerRequests(source);
    await begin();
    await advance(10_000);
    assert.equal(source.keyFrameRequests, 0);
    state.subscribed = true;
    await advance(300);
    assert.equal(source.keyFrameRequests, 1);
    assert.equal(keyFramesSent(events), 1);
    await stream.stop();
  });

  it('asks right away for the first subscriber while the clock still reads less than the interval', async function () {
    // performance.now() counts from the process start
    mock.timers.setTime(0);
    const {source, state, stream, begin} = setup('video', false, {keyFrameIntervalMs: 60_000});
    await begin();
    state.subscribed = true;
    await advance(300);
    assert.equal(source.keyFrameRequests, 1);
    await stream.stop();
  });

  it('shares the rate limit with the other keyframe requests', async function () {
    const {source, state, stream, tick, begin} = setup('video', false, {keyFrameIntervalMs: 2000});
    await begin();
    await advance(5000);
    state.subscribed = true;
    // The late joiner request goes out first, so the one of the interval has to wait
    source.push(su('video', 1));
    await tick();
    assert.equal(source.keyFrameRequests, 1);
    await advance(900);
    assert.equal(source.keyFrameRequests, 1);
    await advance(200);
    assert.equal(source.keyFrameRequests, 2);
    await stream.stop();
  });

  it('never asks if the option is unset or 0', async function () {
    for (const extra of [{}, {keyFrameIntervalMs: 0}]) {
      const {source, stream, begin} = setup('video', true, extra);
      await begin();
      await advance(60_000);
      assert.equal(source.keyFrameRequests, 0);
      await stream.stop();
    }
  });

  it('stops asking when the stream is stopped or its source ends', async function () {
    for (const end of ['stop', 'source end']) {
      const {source, stream, begin} = setup('video', true, {keyFrameIntervalMs: 1000});
      await begin();
      await advance(1000);
      assert.equal(source.keyFrameRequests, 1);
      await (end === 'stop' ? stream.stop() : source.stop());
      await advance(5000);
      assert.ok(stream.isStopped);
      assert.equal(source.keyFrameRequests, 1, end);
    }
  });

  it('does not ask for a stream that failed to start', async function () {
    const ended = setup('video', true, {keyFrameIntervalMs: 1000});
    const endedStart = ended.stream.start();
    await ended.source.stop();
    await assert.rejects(endedStart, /ended before producing any output/);
    const silent = setup('video', true, {keyFrameIntervalMs: 1000});
    const silentStart = assert.rejects(silent.stream.start(), /produced no output within 5000ms/);
    await silent.tick();
    await advance(5000);
    await silentStart;
    await advance(5000);
    assert.equal(ended.source.keyFrameRequests, 0);
    assert.equal(silent.source.keyFrameRequests, 0);
    await silent.stream.stop();
  });

  it('ignores the option for a JPEG stream', async function () {
    const {source, stream} = setup('jpeg', true, {keyFrameIntervalMs: 1000});
    await stream.start();
    source.push(su('jpeg', 0, {isKeyFrame: true}));
    await advance(5000);
    assert.equal(source.keyFrameRequests, 0);
    await stream.stop();
  });

  it('works with sources that cannot request keyframes', async function () {
    const {source, events, stream, begin} = setup('video', true, {keyFrameIntervalMs: 1000});
    delete (source as any).requestKeyFrame;
    await begin();
    await advance(5000);
    assert.equal(keyFramesSent(events), 1);
    await stream.stop();
  });
});
