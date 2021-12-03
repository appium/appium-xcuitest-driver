import _ from 'lodash';
import { fs } from 'appium-support';
import log from '../logger';
import { errors } from 'appium-base-driver';
import { services } from 'appium-ios-device';

const commands = {};

function requireOptions (opts = {}, reqKeys = []) {
  for (const key of reqKeys) {
    if (!_.isString(opts[key]) || _.isEmpty(opts[key])) {
      throw new errors.InvalidArgumentError(
        `'${key}' is expected to be a valid string. '${opts[key]}' is given instead`
      );
    }
  }
  return opts;
}

commands.mobileInstallApp = async function mobileInstallApp (opts = {}) {
  const { app, timeoutMs, strategy } = requireOptions(opts, ['app']);
  const srcAppPath = await this.helpers.configureApp(app, '.app');
  log.info(`Installing '${srcAppPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
    `with UDID '${this.opts.device.udid}'`);
  if (!await fs.exists(srcAppPath)) {
    log.errorAndThrow(`The application at '${srcAppPath}' does not exist or is not accessible`);
  }
  await this.opts.device.installApp(
    srcAppPath, timeoutMs ?? this.opts.appPushTimeout, strategy ?? this.opts.appInstallStrategy
  );
  log.info(`Installation of '${srcAppPath}' succeeded`);
};

commands.mobileIsAppInstalled = async function mobileIsAppInstalled (opts = {}) {
  const {bundleId} = requireOptions(opts, ['bundleId']);
  const installed = await this.opts.device.isAppInstalled(bundleId);
  log.info(`App '${bundleId}' is${installed ? '' : ' not'} installed`);
  return installed;
};

commands.mobileRemoveApp = async function mobileRemoveApp (opts = {}) {
  const {bundleId} = requireOptions(opts, ['bundleId']);
  log.info(`Uninstalling the application with bundle identifier '${bundleId}' ` +
    `from the ${this.isRealDevice() ? 'real device' : 'Simulator'} with UDID '${this.opts.device.udid}'`);
  try {
    await this.opts.device.removeApp(bundleId);
    log.info(`Removal of '${bundleId}' succeeded`);
    return true;
  } catch (err) {
    log.warn(`Cannot remove '${bundleId}'. Original error: ${err.message}`);
    return false;
  }
};

commands.mobileLaunchApp = async function mobileLaunchApp (opts = {}) {
  const launchOptions = requireOptions(opts, ['bundleId']);
  if (opts.arguments) {
    launchOptions.arguments = _.isArray(opts.arguments) ? opts.arguments : [opts.arguments];
  }
  if (opts.environment) {
    launchOptions.environment = opts.environment;
  }
  return await this.proxyCommand('/wda/apps/launch', 'POST', launchOptions);
};

commands.mobileTerminateApp = async function mobileTerminateApp (opts = {}) {
  return await this.proxyCommand('/wda/apps/terminate', 'POST', requireOptions(opts, ['bundleId']));
};

commands.mobileActivateApp = async function mobileActivateApp (opts = {}) {
  return await this.proxyCommand('/wda/apps/activate', 'POST', requireOptions(opts, ['bundleId']));
};

/**
 * Returns the current application state
 *
 * @param {Object} opts - Options set, which must contain `bundleId` property
 * @returns {number} The actual application state code. See
 * https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
 * to get the list of possible values.
 */
commands.mobileQueryAppState = async function mobileQueryAppState (opts = {}) {
  return await this.proxyCommand('/wda/apps/state', 'POST', requireOptions(opts, ['bundleId']));
};

commands.installApp = async function installApp (appPath, opts = {}) {
  await this.mobileInstallApp({
    ...(_.isPlainObject(opts) ? opts : {}),
    app: appPath,
  });
};

commands.activateApp = async function activateApp (bundleId, opts = {}) {
  return await this.mobileLaunchApp(Object.assign({}, opts, {bundleId}));
};

commands.isAppInstalled = async function isAppInstalled (bundleId) {
  return await this.mobileIsAppInstalled({bundleId});
};

commands.terminateApp = async function terminateApp (bundleId) {
  return await this.mobileTerminateApp({bundleId});
};

commands.queryAppState = async function queryAppState (bundleId) {
  return await this.mobileQueryAppState({bundleId});
};

/**
 * @typedef {Object} ListAppsOptions
 * @property {'System'|'User'} applicationType [User] The type of applications to list
 */

/**
 * List applications installed on the real device under test
 *
 * @param {ListAppsOptions} opts
 * @returns {Array<Object>} A list of apps, where each item is a map where keys are
 * bundle identifiers and values are maps of platform-specific app properties.
 */
commands.mobileListApps = async function mobileListApps (opts = {}) {
  if (!this.isRealDevice()) {
    throw new errors.NotImplementedError(`This extension is only supported on real devices`);
  }

  const {
    applicationType = 'User',
  } = opts;
  const service = await services.startInstallationProxyService(this.opts.device.udid);
  try {
    return await service.listApplications({applicationType});
  } finally {
    service.close();
  }
};

export default commands;
