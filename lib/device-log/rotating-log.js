import _ from 'lodash';
import {logger} from 'appium/support';

const MAX_LOG_ENTRIES_COUNT = 10000;

class RotatingLog {
  constructor(showLogs = false, label = 'Log Label') {
    this.log = logger.getLogger(label);

    this.showLogs = showLogs;
    this.logs = [];
    this.logIdxSinceLastRequest = 0;

    this.isCapturing = false;
  }

  // eslint-disable-next-line require-await
  async startCapture() {
    this.isCapturing = true;
  }

  // eslint-disable-next-line require-await
  async stopCapture() {
    this.isCapturing = false;
  }

  /**
   * @privateRemarks Subclasses must implement this.
   */
  addLogLine() {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line require-await
  async getLogs() {
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

  // eslint-disable-next-line require-await
  async getAllLogs() {
    return _.clone(this.logs);
  }

  get logs() {
    if (!this._logs) {
      this.logs = [];
    }
    return this._logs;
  }

  set logs(logs) {
    this._logs = logs;
  }
}

export {RotatingLog, MAX_LOG_ENTRIES_COUNT};
export default RotatingLog;
