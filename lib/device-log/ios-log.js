import { EventEmitter } from 'events';

// We keep only the most recent log entries to avoid out of memory error
const MAX_LOG_ENTRIES_COUNT = 10000;

class IOSLog extends EventEmitter {

  constructor () {
    super();
    this.logs = [];
    this.logIdxSinceLastRequest = -1;
    this.maxBufferSize = MAX_LOG_ENTRIES_COUNT;
  }

  async startCapture () { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'startCapture' function`);
  }

  async stopCapture () { // eslint-disable-line require-await
    throw new Error(`Sub-classes need to implement a 'stopCapture' function`);
  }

  get isCapturing () {
    throw new Error(`Sub-classes need to implement a 'isCapturing' function`);
  }

  broadcast (logLine) {
    const logObj = {
      timestamp: Date.now(),
      level: 'ALL',
      message: logLine
    };
    this.logs.push(logObj);
    this.emit('output', logObj);
    if (this.logs.length > this.maxBufferSize) {
      this.logs.shift();
      if (this.logIdxSinceLastRequest > 0) {
        --this.logIdxSinceLastRequest;
      }
    }
  }

  getLogs () {
    if (this.logs.length && this.logIdxSinceLastRequest < this.logs.length) {
      let result = this.logs;
      if (this.logIdxSinceLastRequest > 0) {
        result = result.slice(this.logIdxSinceLastRequest);
      }
      this.logIdxSinceLastRequest = this.logs.length;
      return result;
    }
    return [];
  }

  getAllLogs () {
    return this.logs;
  }
}

export { IOSLog };
export default IOSLog;
