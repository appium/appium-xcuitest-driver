import _ from 'lodash';
import { logger } from 'appium-support';


const log = logger.getLogger('SafariConsole');
log.warning = log.warn; // js console has `warning` level, so map to `warn`

class SafariConsoleLog {
  constructor (showLogs) {
    this.showLogs = showLogs;
    this.logs = [];
    this.start = 0;

    this.capture = false;
  }

  async startCapture () {
    this.capture = true;
  }

  async stopCapture () {
    this.capture = false;
  }

  addLogLine (out) {
    if (this.capture) {
      this.logs.push(out);
    }

    // format output like
    //     SafariConsole [WARNING][http://appium.io 2:13] Log something to warn
    if (this.showLogs) {
      let level = 'debug';
      if (out.level && (out.level === 'warning' || out.level === 'error')) {
        level = out.level;
      }
      for (let line of out.text.split('\n')) {
        // url is optional, so get formatting here
        const url = out.url ? `${out.url} ` : '';
        log[level](`[${level.toUpperCase()}][${url}${out.line}:${out.column}] ${line}`);
      }
    }
  }

  async getLogs () {
    let logs = this.logs.slice(this.start);
    this.start = this.logs.length;
    return logs;
  }

  async getAllLogs () {
    return _.clone(this.logs);
  }
}

export { SafariConsoleLog };
export default SafariConsoleLog;
