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

      /*
       * The output will be like:
       *   {
       *     "source": "javascript",
       *     "level":"error",
       *     "text":"ReferenceError: Can't find variable: s_account",
       *     "type":"log",
       *     "line":2,
       *     "column":21,
       *     "url":"https://assets.adobedtm.com/b46e318d845250834eda10c5a20827c045a4d76f/scripts/satellite-57866f8b64746d53a8000104-staging.js",
       *     "repeatCount":1,
       *     "stackTrace":[{
       *       "functionName":"global code",
       *       "url":"https://assets.adobedtm.com/b46e318d845250834eda10c5a20827c045a4d76f/scripts/satellite-57866f8b64746d53a8000104-staging.js",
       *       "scriptId":"6",
       *       "lineNumber":2,
       *       "columnNumber":21
       *     }]
       *  }
       *
       * we need, at least, `level` (in accordance with Java levels
       * (https://docs.oracle.com/javase/7/docs/api/java/util/logging/Level.html)),
       * `timestamp`, and `message` to satisfy the java client. In order to
       * provide all the information to the client, `message` is the full
       * object, stringified.
       */
      const entry = {
        level: {
          error: 'SEVERE',
          warning: 'WARNING',
          log: 'FINE',
        }[out.level] || 'INFO',
        timestamp: Date.now(),
        message: JSON.stringify(out),
      };
      this.logs.push(entry);
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
