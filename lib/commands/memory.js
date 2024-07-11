import _ from 'lodash';
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

    const device = /** @type {import('../real-device').RealDevice} */ (this.device);

    /** @type {import('../real-device-clients/devicectl').AppInfo[]} */
    const appInfos = await device.devicectl.listApps(bundleId);
    if (_.isEmpty(appInfos)) {
      throw new errors.InvalidArgumentError(
        `The application identified by ${bundleId} cannot be found on the device. Is it installed?`
      );
    }

    // This regexp tries to match the process name of the main bundle executable.
    // For example, if 'url' contains something like
    // `file:///private/var/containers/Bundle/Application/093ACA6D-8F0B-4601-87B9-4099E43A1A20/Target.app/`
    // and the following processes might be running:
    // `file:///private/var/containers/Bundle/Application/093ACA6D-8F0B-4601-87B9-4099E43A1A20/Target.app/Target`
    // `file:///private/var/containers/Bundle/Application/093ACA6D-8F0B-4601-87B9-4099E43A1A20/Target.app/PlugIns/WidgetExtension.appex/WidgetExtension`
    // then we only want to match the first one.
    // Unfortunately devicectl does not provide more info which would
    // allow to connect a bundle id to a process id.
    const pattern = new RegExp(`^${_.escapeRegExp(appInfos[0].url)}[^/]+$`);
    /** @type {number[]} */
    const pids = (await device.devicectl.listProcesses())
      .filter(({executable}) => pattern.test(executable))
      .map(({processIdentifier}) => processIdentifier);
    if (_.isEmpty(pids)) {
      throw new errors.InvalidArgumentError(
        `The application identified by ${bundleId} must be running in order to simulate the Low Memory warning`
      );
    }
    this.log.info(`Emulating Low Memory warning for the process id ${pids[0]}, bundle id ${bundleId}`);
    await device.devicectl.sendMemoryWarning(pids[0]);
  }
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
