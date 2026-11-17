import type {MediaTrack, MediaUnit} from './types.js';

/**
 * Groups units into events that are homogeneous by track, batching each track on its own
 * (a video keyframe always starts a new batch).
 */
export class UnitBatcher {
  private pending = new Map<MediaTrack, MediaUnit[]>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly batchMs: number,
    private readonly onBatch: (units: MediaUnit[]) => void,
  ) {}

  push(unit: MediaUnit): void {
    if (unit.track === 'video' && unit.key) {
      this.flushTrack(unit.track);
    }
    const units = this.pending.get(unit.track) ?? [];
    units.push(unit);
    this.pending.set(unit.track, units);
    if (this.batchMs <= 0 || unit.track === 'jpeg') {
      this.flushTrack(unit.track);
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchMs);
    }
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const track of this.pending.keys()) {
      this.flushTrack(track);
    }
  }

  close(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }

  private flushTrack(track: MediaTrack): void {
    const units = this.pending.get(track);
    if (units?.length) {
      this.pending.delete(track);
      this.onBatch(units);
    }
  }
}
