import _ from 'lodash';
import { logger } from 'appium-support';
import { EventEmitter } from 'events';
import { services } from 'appium-ios-device';

const log = logger.getLogger('iOSLog');
const MAX_LOG_ENTRIES_COUNT = 10000;

class IOSDeviceLog extends EventEmitter {

  constructor (opts) {
    super();
    this.udid = opts.udid;
    this.showLogs = !!opts.showLogs;
    this.service = null;
    this.logs = [];
    this.logRow = '';
    this.logIdxSinceLastRequest = -1;
    this.maxBufferSize = MAX_LOG_ENTRIES_COUNT;
  }

  async startCapture () {
    if (this.service) {
      return;
    }
    this.service = await services.createSyslogService(this.udid);
    this.service.start(this.onLog.bind(this));
  }

  onLog (logLine) {
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
    if (this.showLogs) {
      log.info(logLine);
    }
  }

  get isCapturing () {
    return !!this.service;
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

  stopCapture () {
    if (!this.service) {
      return;
    }
    this.service.close();
    this.service = null;
  }
}

export { IOSDeviceLog };
export default IOSDeviceLog;
