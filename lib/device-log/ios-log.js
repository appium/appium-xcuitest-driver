import { IOSLog as IOSDriverIOSLog } from 'appium-ios-driver';
import _ from 'lodash';
import log from '../logger';
import { SubProcess, exec } from 'teen_process';


class IOSLog extends IOSDriverIOSLog {
  async startCaptureSimulator () {
    if (_.isUndefined(this.sim.udid)) {
      throw new Error(`Log capture requires a sim udid`);
    }

    if (!await this.sim.isRunning()) {
      throw new Error(`iOS Simulator with udid ${this.sim.udid} is not running`);
    }
    const tool = 'xcrun';
    const args = ['simctl', 'spawn', this.sim.udid, 'log', 'stream', '--style', 'compact'];
    log.debug(`Starting log capture for iOS Simulator with udid '${this.sim.udid}', ` +
              `using '${tool} ${args.join(' ')}'`);
    try {
      // cleanup existing listeners if the previous session has not been terminated properly
      await exec('pkill', ['-xf', [tool, ...args].join(' ')]);
    } catch (ign) {}
    try {
      this.proc = new SubProcess(tool, args);
      await this.finishStartingLogCapture();
    } catch (e) {
      throw new Error(`Simulator log capture failed. Original error: ${e.message}`);
    }
  }

  get isCapturing () {
    return !!(this.proc && this.proc.isRunning);
  }
}

export { IOSLog };
export default IOSLog;
