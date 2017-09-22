import _ from 'lodash';
import { IOSLog, IOSCrashLog, iosCommands } from 'appium-ios-driver';
import log from '../logger';


let extensions = {};

Object.assign(extensions, iosCommands.logging);

extensions.startLogCapture = async function () {
  this.logs = this.logs || {};
  if (!_.isEmpty(this.logs)) {
    log.warn('Trying to start iOS log capture but it has already started!');
    return;
  }
  this.logs.crashlog = new IOSCrashLog();
  this.logs.syslog = new IOSLog({
    sim: this.opts.device,
    udid: this.isRealDevice() ? this.opts.udid : undefined,
    showLogs: this.opts.showIOSLog,
    realDeviceLogger: this.opts.realDeviceLogger,
  });
  try {
    await this.logs.syslog.startCapture();
  } catch (err) {
    log.warn(`Could not capture logs from device: ${err.message}`);
    log.debug('Continuing without capturing logs.');
    return;
  }
  await this.logs.crashlog.startCapture();
};

export default extensions;
