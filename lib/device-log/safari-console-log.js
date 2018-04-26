import _ from 'lodash';
import { logger } from 'appium-support';


const MAX_LOG_ENTRIES_COUNT = 10000;

const log = logger.getLogger('SafariConsole');
log.warning = log.warn; // js console has `warning` level, so map to `warn`

class SafariConsoleLog {
  constructor (showLogs) {
    this.showLogs = showLogs;
    this.logs = [];
    this.logIdxSinceLastRequest = 0;

    this.isCapturing = false;
  }

  async startCapture () {
    this.isCapturing = true;
  }

  async stopCapture () {
    this.isCapturing = false;
  }

  addLogLine (out) {
    if (this.isCapturing) {
      this.logs = this.logs || [];
      while (this.logs.length >= MAX_LOG_ENTRIES_COUNT) {
        this.logs.shift();
        if (this.logIdxSinceLastRequest > 0) {
          this.logIdxSinceLastRequest--;
        }
      }
      this.logs.push(out);
    }

    // format output like
    //     SafariConsole [WARNING][http://appium.io 2:13] Log something to warn
    if (this.showLogs) {
      let level = 'debug';
      if (out.level === 'warning' || out.level === 'error') {
        level = out.level;
      }
      for (const line of out.text.split('\n')) {
        // url is optional, so get formatting here
        const url = out.url ? `${out.url} ` : '';
        log[level](`[${level.toUpperCase()}][${url}${out.line}:${out.column}] ${line}`);
      }
    }
  }

  async getLogs () {
    if (this.logs.length && this.logIdxSinceLastRequest < this.logs.length) {
      let result = _.clone(this.logs);
      if (this.logIdxSinceLastRequest > 0) {
        result = result.slice(this.logIdxSinceLastRequest);
      }
      this.logIdxSinceLastRequest = this.logs.length;
      return result;
    }
    return [];
  }

  async getAllLogs () {
    return _.clone(this.logs);
  }
}

export { SafariConsoleLog };
export default SafariConsoleLog;
