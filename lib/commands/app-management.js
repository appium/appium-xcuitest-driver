import _ from 'lodash';
import {fs} from 'appium/support';
import {errors} from 'appium/driver';
import {services} from 'appium-ios-device';

function requireOptions(opts = {}, reqKeys = []) {
  for (const key of reqKeys) {
    if (!_.isString(opts[key]) || _.isEmpty(opts[key])) {
      throw new errors.InvalidArgumentError(
        `'${key}' is expected to be a valid string. '${opts[key]}' is given instead`
      );
    }
  }
  return opts;
}

export default {
  /**
   * @this {XCUITestDriver}
   */
  async mobileInstallApp(opts = {}) {
    const {app, timeoutMs, strategy} = requireOptions(opts, ['app']);
    const srcAppPath = await this.helpers.configureApp(app, '.app');
    this.log.info(
      `Installing '${srcAppPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
        `with UDID '${this.opts.device.udid}'`
    );
    if (!(await fs.exists(srcAppPath))) {
      this.log.errorAndThrow(
        `The application at '${srcAppPath}' does not exist or is not accessible`
      );
    }
    await this.opts.device.installApp(
      srcAppPath,
      timeoutMs ?? this.opts.appPushTimeout,
      strategy ?? this.opts.appInstallStrategy
    );
    this.log.info(`Installation of '${srcAppPath}' succeeded`);
  },
  /**
   * @this {XCUITestDriver}
   */
  async mobileIsAppInstalled(opts = {}) {
    const {bundleId} = requireOptions(opts, ['bundleId']);
    const installed = await this.opts.device.isAppInstalled(bundleId);
    this.log.info(`App '${bundleId}' is${installed ? '' : ' not'} installed`);
    return installed;
  },
  /**
   * @this {XCUITestDriver}
   */
  async mobileRemoveApp(opts = {}) {
    const {bundleId} = requireOptions(opts, ['bundleId']);
    this.log.info(
      `Uninstalling the application with bundle identifier '${bundleId}' ` +
        `from the ${this.isRealDevice() ? 'real device' : 'Simulator'} with UDID '${
          this.opts.device.udid
        }'`
    );
    try {
      await this.opts.device.removeApp(bundleId);
      this.log.info(`Removal of '${bundleId}' succeeded`);
      return true;
    } catch (err) {
      this.log.warn(`Cannot remove '${bundleId}'. Original error: ${err.message}`);
      return false;
    }
  },
  /**
   * @this {XCUITestDriver}
   */
  async mobileLaunchApp(opts = {}) {
    const launchOptions = requireOptions(opts, ['bundleId']);
    if (opts.arguments) {
      launchOptions.arguments = _.isArray(opts.arguments) ? opts.arguments : [opts.arguments];
    }
    if (opts.environment) {
      launchOptions.environment = opts.environment;
    }
    return await this.proxyCommand('/wda/apps/launch', 'POST', launchOptions);
  },
  /**
   * @this {XCUITestDriver}
   */
  async mobileTerminateApp(opts = {}) {
    return await this.proxyCommand(
      '/wda/apps/terminate',
      'POST',
      requireOptions(opts, ['bundleId'])
    );
  },
  /**
   * @this {XCUITestDriver}
   */
  async mobileActivateApp(opts = {}) {
    return await this.proxyCommand(
      '/wda/apps/activate',
      'POST',
      requireOptions(opts, ['bundleId'])
    );
  },

  /**
   * Kill the given bundle id process via instruments service.
   * https://github.com/YueChen-C/py-ios-device/blob/51f4683c5c3c385a015858ada07a5f1c62d3cf57/ios_device/cli/base.py#L220
   *
   * @param {Object} opts - Options set, which must contain `bundleId` property
   * @returns {boolean} Returns true if the bundle id process was killed. Otherwise false.
   * @this {XCUITestDriver}
   */
  async mobileKillApp(opts = {}) {
    if (!this.isRealDevice()) {
      throw new errors.UnsupportedOperationError('A real device is required');
    }

    const {bundleId} = requireOptions(opts, ['bundleId']);
    return await this.opts.device.terminateApp(bundleId);
  },

  /**
   * Returns the current application state
   *
   * @param {Object} opts - Options set, which must contain `bundleId` property
   * @returns {number} The actual application state code. See
   * https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
   * to get the list of possible values.
   * @this {XCUITestDriver}
   */
  async mobileQueryAppState(opts = {}) {
    return await this.proxyCommand('/wda/apps/state', 'POST', requireOptions(opts, ['bundleId']));
  },

  /**
   * @param {string} appPath
   * @param {object} opts
   * @this {XCUITestDriver}
   */
  async installApp(appPath, opts = {}) {
    await this.mobileInstallApp({
      ...(_.isPlainObject(opts) ? opts : {}),
      app: appPath,
    });
  },
  /**
   * @param {string} bundleId
   * @param {object} opts
   * @this {XCUITestDriver}
   */
  async activateApp(bundleId, opts = {}) {
    return await this.mobileLaunchApp(Object.assign({}, opts, {bundleId}));
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async isAppInstalled(bundleId) {
    return await this.mobileIsAppInstalled({bundleId});
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async terminateApp(bundleId) {
    return await this.mobileTerminateApp({bundleId});
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async queryAppState(bundleId) {
    return await this.mobileQueryAppState({bundleId});
  },

  /**
   * List applications installed on the real device under test
   *
   * @param {ListAppsOptions} opts
   * @returns {Record<string,any>[]} A list of apps, where each item is a map where keys are
   * bundle identifiers and values are maps of platform-specific app properties.
   */
  async mobileListApps(opts = {}) {
    if (!this.isRealDevice()) {
      throw new errors.NotImplementedError(`This extension is only supported on real devices`);
    }

    const {applicationType = 'User'} = opts;
    const service = await services.startInstallationProxyService(this.opts.device.udid);
    try {
      return await service.listApplications({applicationType});
    } finally {
      service.close();
    }
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * @typedef {Object} ListAppsOptions
 * @property {'System'|'User'} applicationType [User] The type of applications to list
 */
