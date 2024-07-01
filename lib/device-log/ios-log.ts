import {EventEmitter} from 'events';
import { LRUCache } from 'lru-cache';
import type { LogEntry } from '../commands/types';
import type { AppiumLogger } from '@appium/types';
import {logger} from 'appium/support';

// We keep only the most recent log entries to avoid out of memory error
const MAX_LOG_ENTRIES_COUNT = 10000;

export interface IOSLogOptions {
  maxBufferSize?: number;
  log?: AppiumLogger;
}

export abstract class IOSLog<
  TRawEntry,
  TSerializedEntry extends object
> extends EventEmitter {
  private maxBufferSize: number;
  private logs: LRUCache<number, TSerializedEntry>;
  private logIndexSinceLastRequest: number | null;
  private _log: AppiumLogger;

  constructor(opts: IOSLogOptions = {}) {
    super();
    this.maxBufferSize = opts.maxBufferSize ?? MAX_LOG_ENTRIES_COUNT;
    this.logs = new LRUCache({
      max: this.maxBufferSize,
    });
    this.logIndexSinceLastRequest = null;
    this._log = opts.log ?? logger.getLogger(this.constructor.name);
  }

  abstract startCapture(): Promise<void>;
  abstract stopCapture(): Promise<void>;
  abstract get isCapturing(): boolean;

  get log(): AppiumLogger {
    return this._log;
  }

  broadcast(entry: TRawEntry): void {
    let recentIndex = -1;
    for (const key of this.logs.rkeys()) {
      recentIndex = key;
      break;
    }
    const serializedEntry = this._serializeEntry(entry);
    this.logs.set(++recentIndex, serializedEntry);
    if (this.listenerCount('output')) {
      this.emit('output', this._deserializeEntry(serializedEntry));
    }
  }

  getLogs(): LogEntry[] {
    const result: LogEntry[] = [];
    let recentLogIndex: number | null = null;
    for (const [index, value] of this.logs.entries()) {
      if (this.logIndexSinceLastRequest && index > this.logIndexSinceLastRequest
          || !this.logIndexSinceLastRequest) {
        recentLogIndex = index;
        result.push(this._deserializeEntry(value));
      }
    }
    if (recentLogIndex !== null) {
      this.logIndexSinceLastRequest = recentLogIndex;
    }
    return result;
  }

  getAllLogs(): LogEntry[] {
    const result: LogEntry[] = [];
    for (const value of this.logs.values()) {
      result.push(this._deserializeEntry(value));
    }
    return result;
  }

  protected abstract _serializeEntry(value: TRawEntry): TSerializedEntry;
  protected abstract _deserializeEntry(value: TSerializedEntry): LogEntry;

  protected _clearEntries() {
    this.logs.clear();
  }
}

export default IOSLog;
