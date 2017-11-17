import _ from 'lodash';
import { iosCommands } from 'appium-ios-driver';
import { IOSCrashLog } from '../device-log/ios-crash-log';
import { IOSLog } from '../device-log/ios-log';
import log from '../logger';

let extensions = {};

Object.assign(extensions, iosCommands.logging);

extensions.startLogCapture = async function () {
  this.logs = this.logs || {};
  if (!_.isUndefined(this.logs.syslog) && this.logs.syslog.isCapturing) {
    log.warn('Trying to start iOS log capture but it has already started!');
    return true;
  }
  if (_.isUndefined(this.logs.syslog)) {
    this.logs.crashlog = new IOSCrashLog({
      sim: this.opts.device,
      udid: this.isRealDevice() ? this.opts.udid : undefined,
    });
    this.logs.syslog = new IOSLog({
      sim: this.opts.device,
      udid: this.isRealDevice() ? this.opts.udid : undefined,
      showLogs: this.opts.showIOSLog,
      realDeviceLogger: this.opts.realDeviceLogger,
    });
  }
  try {
    await this.logs.syslog.startCapture();
  } catch (err) {
    log.warn(`Could not capture logs from the device: ${err.message}`);
    log.debug('Continuing without capturing logs.');
    return false;
  }
  await this.logs.crashlog.startCapture();
  return true;
};

export default extensions;
