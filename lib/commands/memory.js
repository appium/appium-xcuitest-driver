import _ from 'lodash';
import { Devicectl } from '../devicectl';
import { errors } from 'appium/driver';

export default {
  /**
   * Simulates Low Memory warning on the given application
   *
   * @since Xcode 15
   * @param {string} bundleId - The bundle identifier of the target app. The app must be running
   * @this {XCUITestDriver}
   * @throws {Error} if the app is not running or is not installed
   */
  async mobileSendMemoryWarning(bundleId) {
    if (!this.isRealDevice()) {
      throw new Error('Memory warning simulation is only supported on real devices');
    }

    const devicectl = new Devicectl(this.opts.udid, this.log);
    /** @type {import('../devicectl').Apps[]} */
    const appInfos = await devicectl.listApps(bundleId);
    if (_.isEmpty(appInfos)) {
      throw new errors.InvalidArgumentError(
        `The application identified by ${bundleId} cannot be found on the device. Is it installed?`
      );
    }

    const pattern = new RegExp(`^${_.escapeRegExp(appInfos[0].url)}[^/]+$`);
    /** @type {number[]} */
    const pids = (await devicectl.listProcesses())
      // This is kind'a lame matching method
      // but unfortunately devicectl does not provide more info that
      // allows to connect bundleId to a process id
      .filter(({executable}) => pattern.test(executable))
      .map(({processIdentifier}) => processIdentifier);
    if (_.isEmpty(pids)) {
      throw new errors.InvalidArgumentError(
        `The application identified by ${bundleId} must be running in order to simulate the Low Memory warning`
      );
    }
    this.log.info(`Emulating Low Memory warning for the process id ${pids[0]}, bundle id ${bundleId}`);
    await devicectl.sendMemoryWarning(pids[0]);
  }
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */