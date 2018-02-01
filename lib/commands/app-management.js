import _ from 'lodash';
import { fs } from 'appium-support';
import log from '../logger';

let commands = {};

function extractMandatoryOptions (opts = {}, keys) {
  const result = {};
  for (const key of keys) {
    const value = opts[key];
    if (!_.isString(value) || _.isEmpty(value)) {
      log.errorAndThrow(`'${key}' is expected to be a valid string. '${value}' is given instead`);
    }
    result[key] = value;
  }
  return result;
}

commands.mobileInstallApp = async function (opts = {}) {
  const {app} = extractMandatoryOptions(opts, ['app']);
  const dstPath = await this.helpers.configureApp(app, '.app');
  log.info(`Installing '${dstPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
           `with UDID ${this.opts.device.udid}`);
  if (!await fs.exists(dstPath)) {
    log.errorAndThrow(`The application at '${dstPath}' does not exist or is not accessible`);
  }
  try {
    await this.opts.device.installApp(dstPath);
    log.info(`Installation of '${dstPath}' succeeded`);
  } finally {
    if (dstPath !== app) {
      await fs.rimraf(dstPath);
    }
  }
};

commands.mobileIsAppInstalled = async function (opts = {}) {
  const {bundleId} = extractMandatoryOptions(opts, ['bundleId']);
  const installed = await this.opts.device.isAppInstalled(bundleId);
  log.info(`App '${bundleId}' is${installed ? '' : ' not'} installed`);
  return installed;
};

commands.mobileRemoveApp = async function (opts = {}) {
  const {bundleId} = extractMandatoryOptions(opts, ['bundleId']);
  log.info(`Uninstalling the application with bundle identifier '${bundleId}' ` +
    `from the ${this.isRealDevice() ? 'real device' : 'Simulator'} with UDID ${this.opts.device.udid}`);
  await this.opts.device.removeApp(bundleId);
  log.info(`Removal of '${bundleId}' succeeded`);
};

commands.mobileLaunchApp = async function (opts = {}) {
  const wdaOpts = extractMandatoryOptions(opts, ['bundleId']);
  if (opts.arguments) {
    wdaOpts.arguments = _.isArray(opts.arguments) ? opts.arguments : [opts.arguments];
  }
  if (opts.environment) {
    wdaOpts.environment = opts.environment;
  }
  return await this.proxyCommand('/wda/apps/launch', 'POST', wdaOpts);
};

commands.mobileTerminateApp = async function (opts = {}) {
  return await this.proxyCommand('/wda/apps/terminate', 'POST', extractMandatoryOptions(opts, ['bundleId']));
};

commands.mobileActivateApp = async function (opts = {}) {
  return await this.proxyCommand('/wda/apps/activate', 'POST', extractMandatoryOptions(opts, ['bundleId']));
};

/**
 * Returns the current application state
 *
 * @param {Object} opts - Options set, which must contain `bundleId` property
 * @returns {number} The actual application state code. See
 * https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc
 * to get the list of possible values.
 */
commands.mobileQueryAppState = async function (opts = {}) {
  return await this.proxyCommand('/wda/apps/state', 'POST', extractMandatoryOptions(opts, ['bundleId']));
};

commands.installApp = async function (appPath) {
  await this.mobileInstallApp({app: appPath});
};

commands.activateApp = async function (bundleId, opts = {}) {
  return await this.mobileLaunchApp(Object.assign({}, opts, {bundleId}));
};

commands.isAppInstalled = async function (bundleId) {
  return await this.mobileIsAppInstalled({bundleId});
};

commands.terminateApp = async function (bundleId) {
  return await this.mobileTerminateApp({bundleId});
};

commands.queryAppState = async function (bundleId) {
  return await this.mobileQueryAppState({bundleId});
};

export default commands;
