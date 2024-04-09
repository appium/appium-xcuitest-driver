import {fs, timing, util} from 'appium/support';
import path from 'path';
import {services, utilities, INSTRUMENT_CHANNEL} from 'appium-ios-device';
import B from 'bluebird';
import defaultLogger from './logger';
import _ from 'lodash';
import {exec} from 'teen_process';
import {extractBundleId, SAFARI_BUNDLE_ID} from './app-utils';
import {pushFolder} from './ios-fs-helpers';
import { Devicectl } from './devicectl';

const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const INSTALLATION_STAGING_DIR = 'PublicStaging';
const APPLICATION_NOTIFICATION_TIMEOUT_MS = 30 * 1000;
const IOS_DEPLOY_TIMEOUT_MS = 4 * 60 * 1000;
const IOS_DEPLOY = 'ios-deploy';
const APP_INSTALL_STRATEGY = Object.freeze({
  SERIAL: 'serial',
  PARALLEL: 'parallel',
  IOS_DEPLOY,
});

/**
 * @returns {Promise<string[]>}
 */
export async function getConnectedDevices() {
  return await utilities.getConnectedDevices();
}

export class RealDevice {
  /**
   * @param {string} udid
   * @param {import('@appium/types').AppiumLogger} [logger]
   */
  constructor(udid, logger) {
    this.udid = udid;
    this._log = logger ?? defaultLogger;
    this.devicectl = new Devicectl(this.udid, this._log);
  }

  /**
   * @returns {import('@appium/types').AppiumLogger}
   */
  get log() {
    return this._log;
  }

  /**
   * @param {string} bundleId
   */
  async remove(bundleId) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      await service.uninstallApplication(bundleId);
    } finally {
      service.close();
    }
  }

  /**
   * @param {string} bundleId
   */
  async removeApp(bundleId) {
    await this.remove(bundleId);
  }

  /**
   *
   * @param {string} app
   * @param {number} [timeout]
   * @param {'ios-deploy'|'serial'|'parallel'|null} strategy
   * @privateRemarks This really needs type guards built out
   */
  async install(app, timeout, strategy = null) {
    if (
      strategy &&
      !_.values(APP_INSTALL_STRATEGY).includes(/** @type {any} */ (_.toLower(strategy)))
    ) {
      throw new Error(
        `App installation strategy '${strategy}' is unknown. ` +
          `Only the following strategies are supported: ${_.values(APP_INSTALL_STRATEGY)}`,
      );
    }
    this.log.debug(
      `Using '${strategy ?? APP_INSTALL_STRATEGY.SERIAL}' app deployment strategy. ` +
        `You could change it by providing another value to the 'appInstallStrategy' capability`,
    );

    const installWithIosDeploy = async () => {
      try {
        await fs.which(IOS_DEPLOY);
      } catch (err) {
        throw new Error(`'${IOS_DEPLOY}' utility has not been found in PATH. Is it installed?`);
      }
      try {
        await exec(IOS_DEPLOY, ['--id', this.udid, '--bundle', app], {
          timeout: timeout ?? IOS_DEPLOY_TIMEOUT_MS,
        });
      } catch (err) {
        throw new Error(err.stderr || err.stdout || err.message);
      }
    };

    const timer = new timing.Timer().start();
    if (_.toLower(/** @type {'ios-deploy'} */ (strategy)) === APP_INSTALL_STRATEGY.IOS_DEPLOY) {
      await installWithIosDeploy();
    } else {
      const afcService = await services.startAfcService(this.udid);
      try {
        const bundleId = await extractBundleId(app);
        const bundlePathOnPhone = path.join(INSTALLATION_STAGING_DIR, bundleId);
        await pushFolder(afcService, app, bundlePathOnPhone, {
          timeoutMs: timeout,
          enableParallelPush:
            _.toLower(/** @type {'parallel'} */ (strategy)) === APP_INSTALL_STRATEGY.PARALLEL,
        });
        await this.installOrUpgradeApplication(
          bundlePathOnPhone,
          await this.isAppInstalled(bundleId),
        );
      } catch (err) {
        this.log.warn(`Error installing app '${app}': ${err.message}`);
        if (err instanceof B.TimeoutError) {
          this.log.warn(`Consider increasing the value of 'appPushTimeout' capability`);
        }
        this.log.warn(`Falling back to '${IOS_DEPLOY}' usage`);
        try {
          await installWithIosDeploy();
        } catch (err1) {
          throw new Error(
            `Could not install '${app}':\n` + `  - ${err.message}\n` + `  - ${err1.message}`,
          );
        }
      } finally {
        afcService.close();
      }
    }
    this.log.info(`App installation succeeded after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
  }

  /**
   * @param {string} bundlePathOnPhone
   * @param {boolean} [isUpgrade=false]
   */
  async installOrUpgradeApplication(bundlePathOnPhone, isUpgrade = false) {
    const notificationService = await services.startNotificationProxyService(this.udid);
    const installationService = await services.startInstallationProxyService(this.udid);
    const appInstalledNotification = new B((resolve) => {
      notificationService.observeNotification(APPLICATION_INSTALLED_NOTIFICATION, {
        notification: resolve,
      });
    });
    const clientOptions = {PackageType: 'Developer'};
    try {
      if (isUpgrade) {
        this.log.debug(`An upgrade of the existing application is going to be performed`);
        await installationService.upgradeApplication(bundlePathOnPhone, clientOptions);
      } else {
        this.log.debug(`A new application installation is going to be performed`);
        await installationService.installApplication(bundlePathOnPhone, clientOptions);
      }
      try {
        await appInstalledNotification.timeout(
          APPLICATION_NOTIFICATION_TIMEOUT_MS,
          `Could not get the application installed notification within ` +
            `${APPLICATION_NOTIFICATION_TIMEOUT_MS}ms but we will continue`,
        );
      } catch (e) {
        this.log.warn(`Failed to receive the notification. Error: ${e.message}`);
      }
    } finally {
      installationService.close();
      notificationService.close();
    }
  }

  /**
   * Alias for {@linkcode install}
   * @param {string} app
   * @param {number} timeout
   * @param {'ios-deploy'|'serial'|'parallel'|null} strategy
   */
  async installApp(app, timeout, strategy) {
    return await this.install(app, timeout, strategy);
  }

  /**
   * Return an application object if test app has 'bundleid'.
   * The target bundleid can be User and System apps.
   *
   * @param {string} bundleId The bundleId to ensure it is installed
   * @return {Promise<boolean>} Returns True if the app is installed
   * on the device under test.
   */
  async isAppInstalled(bundleId) {
    return Boolean(await this.fetchAppInfo(bundleId));
  }

  /**
   * Fetches various attributes, like bundle id, version, entitlements etc. of
   * an installed application.
   *
   * @param {string} bundleId the bundle identifier of an app to check
   * @param {string|string[]|undefined} returnAttributes If provided then
   * only fetches the requested attributes of the app into the resulting object.
   * Some apps may have too many attributes, so it makes sense to limit these
   * by default if you don't need all of them.
   * @returns {Promise<Object|undefined>} Either app info as an object or undefined
   * if the app is not found.
   */
  async fetchAppInfo(bundleId, returnAttributes = ['CFBundleIdentifier', 'CFBundleVersion']) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      return (
        await service.lookupApplications({
          bundleIds: bundleId,
          // https://github.com/appium/appium/issues/18753
          returnAttributes,
        })
      )[bundleId];
    } finally {
      service.close();
    }
  }

  /**
   * @param {string} bundleId
   * @param {string} platformVersion
   * @returns {Promise<boolean>}
   */
  async terminateApp(bundleId, platformVersion) {
    let instrumentService;
    let installProxyService;
    try {
      installProxyService = await services.startInstallationProxyService(this.udid);
      const apps = await installProxyService.listApplications({
        returnAttributes: ['CFBundleIdentifier', 'CFBundleExecutable']
      });
      if (!apps[bundleId]) {
        this.log.info(`The bundle id '${bundleId}' did not exist`);
        return false;
      }
      const executableName = apps[bundleId].CFBundleExecutable;
      this.log.debug(`The executable name for the bundle id '${bundleId}' was '${executableName}'`);

      // 'devicectl' has overhead (generally?) than the instrument service via appium-ios-device,
      // so hre uses the 'devicectl' only for iOS 17+.
      if (util.compareVersions(platformVersion, '>=', '17.0')) {
        this.log.debug(`Calling devicectl to kill the process`);

        const pids = (await this.devicectl.listProcesses())
          .filter(({executable}) => executable.endsWith(`/${executableName}`))
          .map(({processIdentifier}) => processIdentifier);
        if (_.isEmpty(pids)) {
          this.log.info(`The process of the bundle id '${bundleId}' was not running`);
          return false;
        }
        await this.devicectl.sendSignalToProcess(pids[0], 2);
      } else {
        instrumentService = await services.startInstrumentService(this.udid);

        // The result of "runningProcesses" includes `bundle_id` key in iOS 16+ (possibly a specific 16.x+)
        // then here may not be necessary to find a process with `CFBundleExecutable`
        // after dropping older iOS version support.
        const processes = await instrumentService.callChannel(
          INSTRUMENT_CHANNEL.DEVICE_INFO,
          'runningProcesses',
        );
        const process = processes.selector.find((process) => process.name === executableName);
        if (!process) {
          this.log.info(`The process of the bundle id '${bundleId}' was not running`);
          return false;
        }
          await instrumentService.callChannel(
          INSTRUMENT_CHANNEL.PROCESS_CONTROL,
          'killPid:',
          `${process.pid}`,
        );
      }
    } catch (err) {
      this.log.warn(`Failed to kill '${bundleId}'. Original error: ${err.stderr || err.message}`);
      return false;
    } finally {
      if (installProxyService) {
        installProxyService.close();
      }
      if (instrumentService) {
        instrumentService.close();
      }
    }
    return true;
  }

  /**
   * @param {string} bundleName The name of CFBundleName in Info.plist
   *
   * @returns {Promise<string[]>} A list of User level apps' bundle ids which has
   *                          'CFBundleName' attribute as 'bundleName'.
   */
  async getUserInstalledBundleIdsByBundleName(bundleName) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      const applications = await service.listApplications({
        applicationType: 'User', returnAttributes: ['CFBundleIdentifier', 'CFBundleName']
      });
      return _.reduce(
        applications,
        (acc, {CFBundleName}, key) => {
          if (CFBundleName === bundleName) {
            acc.push(key);
          }
          return acc;
        },
        /** @type {string[]} */ ([]),
      );
    } finally {
      service.close();
    }
  }

  /**
   * @returns {Promise<string>}
   */
  async getPlatformVersion() {
    return await utilities.getOSVersion(this.udid);
  }

  /**
   * @param {import('./driver').XCUITestDriverOpts} opts
   * @returns {Promise<void>}
   */
  async reset({bundleId, fullReset, platformVersion}) {
    if (!bundleId) {
      return;
    }

    if (bundleId === SAFARI_BUNDLE_ID) {
      this.log.debug('Reset requested. About to terminate Safari');
      await this.terminateApp(bundleId, String(platformVersion));
      return;
    }

    if (!fullReset) {
      return;
    }

    this.log.debug(`Reset: fullReset requested. Will try to uninstall the app '${bundleId}'.`);
    if (!(await this.isAppInstalled(bundleId))) {
      this.log.debug('Reset: app not installed. No need to uninstall');
      return;
    }

    try {
      await this.remove(bundleId);
    } catch (err) {
      this.log.error(`Reset: could not remove '${bundleId}' from device: ${err.message}`);
      throw err;
    }
    this.log.debug(`Reset: removed '${bundleId}'`);
  }

}

export default RealDevice;
