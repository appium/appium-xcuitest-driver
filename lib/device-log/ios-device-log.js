import { logger } from 'appium-support';
import { IOSLog } from './ios-log';
import { services } from 'appium-ios-device';

const log = logger.getLogger('IOSDeviceLog');

class IOSDeviceLog extends IOSLog {

  constructor (opts) {
    super();
    this.udid = opts.udid;
    this.showLogs = !!opts.showLogs;
    this.service = null;
  }

  async startCapture () {
    if (this.service) {
      return;
    }
    this.service = await services.startSyslogService(this.udid);
    this.service.start(this.onLog.bind(this));
  }

  onLog (logLine) {
    this.broadcast(logLine);
    if (this.showLogs) {
      log.info(logLine);
    }
  }

  get isCapturing () {
    return !!this.service;
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
