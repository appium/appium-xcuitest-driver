import { fs, timing } from 'appium-support';
import path from 'path';
import { services, utilities } from 'appium-ios-device';
import B from 'bluebird';
import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { extractBundleId } from './app-utils';
import { pushFolder } from './ios-fs-helpers';

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


class IOSDeploy {

  constructor (udid) {
    this.udid = udid;
  }

  async remove (bundleid) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      await service.uninstallApplication(bundleid);
    } finally {
      service.close();
    }
  }

  async removeApp (bundleId) {
    await this.remove(bundleId);
  }

  async install (app, timeout, strategy = null) {
    if (strategy && !_.values(APP_INSTALL_STRATEGY).includes(_.toLower(strategy))) {
      throw new Error(`App installation strategy '${strategy}' is unknown. ` +
        `Only the following strategies are supported: ${_.values(APP_INSTALL_STRATEGY)}`);
    }
    log.debug(`Using '${strategy ?? APP_INSTALL_STRATEGY.SERIAL}' app deployment strategy. ` +
      `You could change it by providing another value to the 'appInstallStrategy' capability`);

    const installWithIosDeploy = async () => {
      try {
        await fs.which(IOS_DEPLOY);
      } catch (err) {
        throw new Error(`'${IOS_DEPLOY}' utility has not been found in PATH. Is it installed?`);
      }
      try {
        await exec(IOS_DEPLOY, [
          '--id', this.udid,
          '--bundle', app,
        ], {timeout: timeout ?? IOS_DEPLOY_TIMEOUT_MS});
      } catch (err) {
        throw new Error(err.stderr || err.stdout || err.message);
      }
    };

    const timer = new timing.Timer().start();
    if (_.toLower(strategy) === APP_INSTALL_STRATEGY.IOS_DEPLOY) {
      await installWithIosDeploy();
    } else {
      const afcService = await services.startAfcService(this.udid);
      try {
        const bundleId = await extractBundleId(app);
        const bundlePathOnPhone = path.join(INSTALLATION_STAGING_DIR, bundleId);
        await pushFolder(afcService, app, bundlePathOnPhone, {
          timeoutMs: timeout,
          enableParallelPush: _.toLower(strategy) === APP_INSTALL_STRATEGY.PARALLEL,
        });
        await this.installOrUpgradeApplication(bundlePathOnPhone, await this.isAppInstalled(bundleId));
      } catch (err) {
        log.warn(`Error installing app '${app}': ${err.message}`);
        if (err instanceof B.TimeoutError) {
          log.warn(`Consider increasing the value of 'appPushTimeout' capability`);
        }
        log.warn(`Falling back to '${IOS_DEPLOY}' usage`);
        try {
          await installWithIosDeploy();
        } catch (err1) {
          throw new Error(`Could not install '${app}':\n` +
            `  - ${err.message}\n` +
            `  - ${err1.message}`);
        }
      } finally {
        afcService.close();
      }
    }
    log.info(`App installation succeeded after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
  }

  async installOrUpgradeApplication (bundlePathOnPhone, isUpgrade = false) {
    const notificationService = await services.startNotificationProxyService(this.udid);
    const installationService = await services.startInstallationProxyService(this.udid);
    const appInstalledNotification = new B((resolve) => {
      notificationService.observeNotification(APPLICATION_INSTALLED_NOTIFICATION, {
        notification: resolve
      });
    });
    const clientOptions = {PackageType: 'Developer'};
    try {
      if (isUpgrade) {
        log.debug(`An upgrade of the existing application is going to be performed`);
        await installationService.upgradeApplication(bundlePathOnPhone, clientOptions);
      } else {
        log.debug(`A new application installation is going to be performed`);
        await installationService.installApplication(bundlePathOnPhone, clientOptions);
      }
      try {
        await appInstalledNotification.timeout(APPLICATION_NOTIFICATION_TIMEOUT_MS,
          `Could not get the application installed notification within ` +
          `${APPLICATION_NOTIFICATION_TIMEOUT_MS}ms but we will continue`);
      } catch (e) {
        log.warn(`Failed to receive the notification. Error: ${e.message}`);
      }
    } finally {
      installationService.close();
      notificationService.close();
    }
  }

  async installApp (...args) {
    return await this.install(...args);
  }

  /**
   * Return an application object if test app has 'bundleid'.
   * The target bundleid can be User and System apps.
   * @param {string} bundleid The bundleId to ensure it is installed
   * @return {boolean} Returns True if the bundleid exists in the result of 'listApplications' like:
   * { "com.apple.Preferences":{
   *   "UIRequiredDeviceCapabilities":["arm64"],
   *   "UIRequiresFullScreen":true,
   *   "CFBundleInfoDictionaryVersion":"6.0",
   *   "Entitlements":
   *     {"com.apple.frontboard.delete-application-snapshots":true,..
   */
  async isAppInstalled (bundleid) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      const applications = await service.lookupApplications({ bundleIds: bundleid });
      return !!applications[bundleid];
    } finally {
      service.close();
    }
  }

  /**
   * @param {string} bundleName The name of CFBundleName in Info.plist
   *
   * @returns {Array<string>} A list of User level apps' bundle ids which has
   *                          'CFBundleName' attribute as 'bundleName'.
   */
  async getUserInstalledBundleIdsByBundleName (bundleName) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      const applications = await service.listApplications({applicationType: 'User'});
      return _.reduce(applications, (acc, {CFBundleName}, key) => {
        if (CFBundleName === bundleName) {
          acc.push(key);
        }
        return acc;
      }, []);
    } finally {
      service.close();
    }
  }

  async getPlatformVersion () {
    return await utilities.getOSVersion(this.udid);
  }
}

export default IOSDeploy;
