import _ from 'lodash';
import {fs, util} from 'appium/support';
import {errors} from 'appium/driver';
import {services} from 'appium-ios-device';

export default {
  /**
   * @param {string} app
   * @param {string} [strategy]
   * @param {number} [timeoutMs]
   * @this {XCUITestDriver}
   */
  async mobileInstallApp(app, timeoutMs, strategy) {
    const srcAppPath = await this.helpers.configureApp(app, '.app');
    this.log.info(
      `Installing '${srcAppPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
        // @ts-expect-error - do not assign arbitrary properties to `this.opts`
        `with UDID '${this.opts.device.udid}'`
    );
    if (!(await fs.exists(srcAppPath))) {
      this.log.errorAndThrow(
        `The application at '${srcAppPath}' does not exist or is not accessible`
      );
    }
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    await this.opts.device.installApp(
      srcAppPath,
      timeoutMs ?? this.opts.appPushTimeout,
      strategy ?? this.opts.appInstallStrategy
    );
    this.log.info(`Installation of '${srcAppPath}' succeeded`);
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async mobileIsAppInstalled(bundleId) {
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    const installed = await this.opts.device.isAppInstalled(bundleId);
    this.log.info(`App '${bundleId}' is${installed ? '' : ' not'} installed`);
    return installed;
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async mobileRemoveApp(bundleId) {
    this.log.info(
      `Uninstalling the application with bundle identifier '${bundleId}' ` +
        `from the ${this.isRealDevice() ? 'real device' : 'Simulator'} with UDID '${
          // @ts-expect-error - do not assign arbitrary properties to `this.opts`
          this.opts.device.udid
        }'`
    );
    try {
      // @ts-expect-error - do not assign arbitrary properties to `this.opts`
      await this.opts.device.removeApp(bundleId);
      this.log.info(`Removal of '${bundleId}' succeeded`);
      return true;
    } catch (err) {
      this.log.warn(`Cannot remove '${bundleId}'. Original error: ${err.message}`);
      return false;
    }
  },
  /**
   * @param {string} bundleId
   * @param {any|any[]} [args]
   * @param {any} [environment]
   * @this {XCUITestDriver}
   */
  async mobileLaunchApp(bundleId, args, environment) {
    /** @type { {arguments?: any[], environment?: any, bundleId: string} } */
    const launchOptions = {bundleId};
    if (args) {
      launchOptions.arguments = _.isArray(args) ? args : [args];
    }
    if (environment) {
      launchOptions.environment = environment;
    }
    return await this.proxyCommand('/wda/apps/launch', 'POST', launchOptions);
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async mobileTerminateApp(bundleId) {
    return await this.proxyCommand('/wda/apps/terminate', 'POST', {bundleId});
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async mobileActivateApp(bundleId) {
    return await this.proxyCommand('/wda/apps/activate', 'POST', {bundleId});
  },

  /**
   * Kill the given bundle id process via instruments service.
   * @see https://github.com/YueChen-C/py-ios-device/blob/51f4683c5c3c385a015858ada07a5f1c62d3cf57/ios_device/cli/base.py#L220
   * @param {string} bundleId
   * @returns {Promise<boolean>} Returns true if the bundle id process was killed. Otherwise false.
   * @this {XCUITestDriver}
   */
  async mobileKillApp(bundleId) {
    if (!this.isRealDevice()) {
      throw new errors.UnsupportedOperationError('A real device is required');
    }

    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    return await this.opts.device.terminateApp(bundleId);
  },

  /**
   * Returns the current application state
   *
   * @param {string} bundleId - Options set, which must contain `bundleId` property
   * @returns {Promise<import('./types').AppState>} The actual application state code. See
   * https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
   * to get the list of possible values.
   * @this {XCUITestDriver}
   */
  async mobileQueryAppState(bundleId) {
    return await this.proxyCommand('/wda/apps/state', 'POST', {bundleId});
  },

  /**
   * @param {string} appPath
   * @param {object} opts
   * @this {XCUITestDriver}
   */
  async installApp(appPath, {timeoutMs, strategy} = {}) {
    await this.mobileInstallApp(appPath, timeoutMs, strategy);
  },
  /**
   * @param {string} bundleId
   * @param {object} opts
   * @this {XCUITestDriver}
   */
  async activateApp(bundleId, opts = {}) {
    const {environment, arguments: args} = opts;
    return await this.mobileLaunchApp(bundleId, args, environment);
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async isAppInstalled(bundleId) {
    return await this.mobileIsAppInstalled(bundleId);
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async terminateApp(bundleId) {
    return await this.mobileTerminateApp(bundleId);
  },
  /**
   * @param {string} bundleId
   * @this {XCUITestDriver}
   */
  async queryAppState(bundleId) {
    return await this.mobileQueryAppState(bundleId);
  },

  /**
   * List applications installed on the real device under test
   *
   * @param {'User'|'System'} [applicationType='User']
   * @returns {Promise<Record<string,any>[]>} A list of apps, where each item is a map where keys are
   * bundle identifiers and values are maps of platform-specific app properties.
   */
  async mobileListApps(applicationType) {
    if (!this.isRealDevice()) {
      throw new errors.NotImplementedError(`This extension is only supported on real devices`);
    }

    const service = await services.startInstallationProxyService(this.opts.device.udid);
    try {
      return await service.listApplications({applicationType});
    } finally {
      service.close();
    }
  },

  /**
   * Close app (simulate device home button). It is possible to restore
   * the app after the timeout or keep it minimized based on the parameter value.
   *
   * @param {number|{timeout: number?}} [seconds]
   * - any positive number of seconds: come back after X seconds
   * - any negative number of seconds or zero: never come back
   * - undefined/null: never come back
   * - {timeout: 5000}: come back after 5 seconds
   * - {timeout: null}, {timeout: -2}: never come back
   * @this {XCUITestDriver}
   */
  async background(seconds) {
    const homescreen = '/wda/homescreen';
    const deactivateApp = '/wda/deactivateApp';

    let endpoint;
    let params = {};
    const selectEndpoint = (timeoutSeconds) => {
      if (!util.hasValue(timeoutSeconds)) {
        endpoint = homescreen;
      } else if (!isNaN(timeoutSeconds)) {
        const duration = parseFloat(timeoutSeconds);
        if (duration >= 0) {
          params = {duration};
          endpoint = deactivateApp;
        } else {
          endpoint = homescreen;
        }
      }
    };
    if (seconds && !_.isNumber(seconds) && _.has(seconds, 'timeout')) {
      const timeout = seconds.timeout;
      selectEndpoint(isNaN(Number(timeout)) ? timeout : parseFloat(String(timeout)) / 1000.0);
    } else {
      selectEndpoint(seconds);
    }
    if (!endpoint) {
      throw new errors.InvalidArgumentError(
        `Argument value is expected to be a valid number. ` +
          `${JSON.stringify(seconds)} has been provided instead`
      );
    }
    return await this.proxyCommand(endpoint, 'POST', params, endpoint !== homescreen);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
