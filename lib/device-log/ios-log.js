import {EventEmitter} from 'events';
import { LRUCache } from 'lru-cache';
import { toLogEntry } from './helpers';

// We keep only the most recent log entries to avoid out of memory error
const MAX_LOG_ENTRIES_COUNT = 10000;

// TODO: Rewrite this class to typescript for better generic typing

export class IOSLog extends EventEmitter {
  constructor(maxBufferSize = MAX_LOG_ENTRIES_COUNT) {
    super();
    this.maxBufferSize = maxBufferSize;
    /** @type {LRUCache<number, any>} */
    this.logs = new LRUCache({
      max: this.maxBufferSize,
    });
    /** @type {number?} */
    this.logIndexSinceLastRequest = null;
  }

  /** @returns {Promise<void>} */
  // eslint-disable-next-line require-await
  async startCapture() {
    throw new Error(`Sub-classes need to implement a 'startCapture' function`);
  }

  /** @returns {Promise<void>} */
  // eslint-disable-next-line require-await
  async stopCapture() {
    throw new Error(`Sub-classes need to implement a 'stopCapture' function`);
  }

  /** @returns {boolean} */
  get isCapturing() {
    throw new Error(`Sub-classes need to implement a 'isCapturing' function`);
  }

  /**
   *
   * @param {any} entry
   * @returns {void}
   */
  broadcast(entry) {
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

  /**
   *
   * @returns {import('../commands/types').LogEntry[]}
   */
  getLogs() {
    /** @type {import('../commands/types').LogEntry[]} */
    const result = [];
    /** @type {number?} */
    let recentLogIndex = null;
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

  /**
   *
   * @returns {import('../commands/types').LogEntry[]}
   */
  getAllLogs() {
    /** @type {import('../commands/types').LogEntry[]} */
    const result = [];
    for (const value of this.logs.values()) {
      result.push(this._deserializeEntry(value));
    }
    return result;
  }

  /**
   *
   * @param {any} value
   * @returns {any}
   */
  _serializeEntry(value) {
    return [value, Date.now()];
  }

  /**
   *
   * @param {any} value
   * @returns {any}
   */
  _deserializeEntry(value) {
    const [message, timestamp] = value;
    return toLogEntry(message, timestamp);
  }

  _clearEntries() {
    this.logs.clear();
  }
}

export default IOSLog;
