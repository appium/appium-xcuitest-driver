/* eslint-disable promise/prefer-await-to-callbacks */
import { fs, timing } from 'appium-support';
import path from 'path';
import { services, utilities } from 'appium-ios-device';
import B from 'bluebird';
import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';

const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const INSTALLATION_STAGING_DIR = 'PublicStaging';
const DEFAULT_ITEM_PUSH_TIMEOUT = 30 * 1000;
const APPLICATION_NOTIFICATION_TIMEOUT = 30 * 1000;
const IOS_DEPLOY = 'ios-deploy';

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

  async install (app, timeout) {
    const timer = new timing.Timer().start();
    try {
      const bundlePathOnPhone = await this.pushAppBundle(app, timeout);
      await this.installApplication(bundlePathOnPhone);
    } catch (err) {
      log.warn(`Error installing app: ${err.message}`);
      log.warn(`Falling back to '${IOS_DEPLOY}' usage`);
      try {
        await fs.which(IOS_DEPLOY);
      } catch (err1) {
        throw new Error(`Could not install '${app}':\n` +
          `  - ${err.message}\n` +
          `  - '${IOS_DEPLOY}' utility has not been found in PATH. Is it installed?`);
      }
      try {
        await exec(IOS_DEPLOY, [
          '--id', this.udid,
          '--bundle', app,
        ]);
      } catch (err1) {
        throw new Error(`Could not install '${app}':\n` +
          `  - ${err.message}\n` +
          `  - ${err1.stderr || err1.stdout || err1.message}`);
      }
    }
    log.info(`App installation succeeded after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
  }

  async installApplication (bundlePathOnPhone) {
    const notificationService = await services.startNotificationProxyService(this.udid);
    const installationService = await services.startInstallationProxyService(this.udid);
    const appInstalledNotification = new B((resolve) => {
      notificationService.observeNotification(APPLICATION_INSTALLED_NOTIFICATION, {notification: resolve});
    });
    try {
      await installationService.installApplication(bundlePathOnPhone, {PackageType: 'Developer'});
      try {
        await appInstalledNotification.timeout(APPLICATION_NOTIFICATION_TIMEOUT, `Could not get the application installed notification within ${APPLICATION_NOTIFICATION_TIMEOUT}ms but we will continue`);
      } catch (e) {
        log.warn(`Failed to receive the notification. Error: ${e.message}`);
      }
    } finally {
      installationService.close();
      notificationService.close();
    }
  }

  async pushAppBundle (app, timeout = DEFAULT_ITEM_PUSH_TIMEOUT) {
    const timer = new timing.Timer().start();
    const afcService = await services.startAfcService(this.udid);
    // We are pushing serially due to this https://github.com/appium/appium/issues/13115. There is nothing else we can do besides this
    try {
      const bundlePathOnPhone = await this.createAppPath(afcService, app);
      await fs.walkDir(app, true, async (itemPath, isDir) => {
        const pathOnPhone = path.join(bundlePathOnPhone, path.relative(app, itemPath));
        if (isDir) {
          await afcService.createDirectory(pathOnPhone);
        } else {
          const readStream = fs.createReadStream(itemPath, {autoClose: true});
          const writeStream = await afcService.createWriteStream(pathOnPhone, {autoDestroy: true});
          writeStream.on('finish', writeStream.destroy);
          let pushError = null;
          const itemPushWait = new B((resolve, reject) => {
            writeStream.on('close', () => {
              if (pushError) {
                reject(pushError);
              } else {
                resolve();
              }
            });
            const onStreamError = (e) => {
              readStream.unpipe(writeStream);
              log.debug(e);
              pushError = e;
            };
            writeStream.on('error', onStreamError);
            readStream.on('error', onStreamError);
          });
          readStream.pipe(writeStream);
          await itemPushWait.timeout(timeout,
            `Could not push '${itemPath}' within the timeout of ${timeout}ms. ` +
            `Consider increasing the value of 'appPushTimeout' capability.`);
        }
      });
      log.debug(`Pushed the app files successfully after ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
      return bundlePathOnPhone;
    } finally {
      afcService.close();
    }
  }

  async createAppPath (afcService, localAppPath) {
    const basename = path.basename(localAppPath);
    const relativePath = path.join(INSTALLATION_STAGING_DIR, basename);
    try {
      await afcService.deleteDirectory(relativePath);
    } catch (ign) {}
    await afcService.createDirectory(relativePath);
    return relativePath;
  }

  async installApp (app, timeout) {
    await this.install(app, timeout);
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
