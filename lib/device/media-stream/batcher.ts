import type {MediaUnit} from './types.js';

/**
 * Groups units into events that are homogeneous by track and cut at video
 * keyframes (a keyframe always starts a new batch).
 */
export class UnitBatcher {
  private pending: MediaUnit[] = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly batchMs: number,
    private readonly onBatch: (units: MediaUnit[]) => void,
  ) {}

  push(unit: MediaUnit): void {
    const [first] = this.pending;
    if (first && (first.track !== unit.track || (unit.track === 'video' && unit.key))) {
      this.flush();
    }
    this.pending.push(unit);
    if (this.batchMs <= 0 || unit.track === 'jpeg') {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.batchMs);
    }
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.length) {
      const batch = this.pending;
      this.pending = [];
      this.onBatch(batch);
    }
  }

  close(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = [];
  }
}
