import { commands as iosCommands } from 'appium-ios-driver';
import { IOSLog, IOSCrashLog } from 'appium-ios-log';
import _ from 'lodash';
import logger from '../logger';


let helpers = {}, extensions = {}, commands = {};

commands.getLogTypes = iosCommands.getLogTypes;

commands.getLog = iosCommands.getLog;

helpers.startLogCapture = async function () {
  if (!_.isEmpty(this.logs)) {
    logger.warn("Trying to start iOS log capture but it's already started!");
    return;
  }
  this.logs.crashlog = new IOSCrashLog();
  this.logs.syslog = new IOSLog({
    sim: this.sim,
    udid: this.opts.udid
  , showLogs: this.opts.showIOSLog
  });
  try {
    await this.logs.syslog.startCapture();
  } catch (err) {
    logger.warn("Could not capture logs from device. Continuing without capturing logs.");
    return;
  }
  await this.logs.crashlog.startCapture();
};

Object.assign(extensions, helpers, commands);
export { extensions, helpers, commands };
export default extensions;
