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
  private _log: AppiumLogger;

  constructor(opts: IOSLogOptions = {}) {
    super();
    this.maxBufferSize = opts.maxBufferSize ?? MAX_LOG_ENTRIES_COUNT;
    this.logs = new LRUCache({
      max: this.maxBufferSize,
    });
    this._log = opts.log ?? logger.getLogger(this.constructor.name);
  }

  abstract startCapture(): Promise<void>;
  abstract stopCapture(): Promise<void>;
  abstract get isCapturing(): boolean;

  get log(): AppiumLogger {
    return this._log;
  }

  // eslint-disable-next-line require-await
  async getLogs(): Promise<LogEntry[]> {
    const result: LogEntry[] = [];
    for (const value of this.logs.rvalues()) {
      result.push(this._deserializeEntry(value as TSerializedEntry));
    }
    this._clearEntries();
    return result;
  }

  protected abstract _serializeEntry(value: TRawEntry): TSerializedEntry;
  protected abstract _deserializeEntry(value: TSerializedEntry): LogEntry;

  protected _clearEntries() {
    this.logs.clear();
  }

  protected broadcast(entry: TRawEntry): void {
    let recentIndex = -1;
    for (const key of this.logs.keys()) {
      recentIndex = key;
      break;
    }
    const serializedEntry = this._serializeEntry(entry);
    this.logs.set(++recentIndex, serializedEntry);
    if (this.listenerCount('output')) {
      this.emit('output', this._deserializeEntry(serializedEntry));
    }
  }
}

export default IOSLog;
