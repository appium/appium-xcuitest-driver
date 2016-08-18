import { iosCommands } from 'appium-ios-driver';
import _ from 'lodash';
import { IOSLog, IOSCrashLog } from 'appium-ios-log';
import log from '../logger';


let extensions = {};

Object.assign(extensions, iosCommands.logging);

extensions.startLogCapture = async function () {
  if (!_.isEmpty(this.logs)) {
    log.warn('Trying to start iOS log capture but it has already started!');
    return;
  }
  this.logs.crashlog = new IOSCrashLog();
  this.logs.syslog = new IOSLog({
    sim: this.opts.device,
    udid: this.isRealDevice() ? this.opts.udid : undefined,
    showLogs: this.opts.showIOSLog
  });
  try {
    await this.logs.syslog.startCapture();
  } catch (err) {
    log.warn('Could not capture logs from device. Continuing without capturing logs.');
    return;
  }
  await this.logs.crashlog.startCapture();
};

export default extensions;
