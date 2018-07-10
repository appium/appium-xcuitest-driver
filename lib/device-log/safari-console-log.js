import { RotatingLog, MAX_LOG_ENTRIES_COUNT } from './rotating-log';


class SafariConsoleLog extends RotatingLog {
  constructor (showLogs) {
    super(showLogs, 'SafariConsole');

    // js console has `warning` level, so map to `warn`
    this.log.warning = this.log.warn;
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
        this.log[level](`[${level.toUpperCase()}][${url}${out.line}:${out.column}] ${line}`);
      }
    }
  }
}

export { SafariConsoleLog };
export default SafariConsoleLog;
