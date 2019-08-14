/* eslint-disable promise/prefer-await-to-callbacks */
import { fs } from 'appium-support';
import path from 'path';
import { services } from 'appium-ios-device';
import B from 'bluebird';
import log from './logger';

const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const INSTALLATION_STAGING_DIR = 'PublicStaging';
const APPLICATION_PUSH_TIMEOUT = 60 * 1000;
const APPLICATION_NOTIFICATION_TIMEOUT = 30 * 1000;

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

  async install (app) {
    const start = new Date();
    try {
      const bundlePathOnPhone = await this.pushAppBundle(app);
      await this.installApplication(bundlePathOnPhone);
      log.info(`Installation is successful after ${new Date() - start}ms`);
    } catch (err) {
      throw new Error(`Could not install app: '${err.message}'`);
    }
  }

  async installApplication (bundlePathOnPhone) {
    const notificationService = await services.startNotificationProxyService(this.udid);
    const installationService = await services.startInstallationProxyService(this.udid);
    const appInstalledNotification = new B((resolve) => {
      notificationService.observeNotification(APPLICATION_INSTALLED_NOTIFICATION, { notification: resolve });
    });
    try {
      await installationService.installApplication(bundlePathOnPhone, { PackageType: 'Developer'});
      try {
        await appInstalledNotification.timeout(APPLICATION_NOTIFICATION_TIMEOUT, `Couldn't get the application installed notification within ${APPLICATION_NOTIFICATION_TIMEOUT}ms but we will continue`);
      } catch (e) {
        log.warn(`Failed to receive the notification. Error: ${e.message}`);
      }
    } finally {
      installationService.close();
      notificationService.close();
    }
  }

  async pushAppBundle (app) {
    const start = new Date();
    const afcService = await services.startAfcService(this.udid);
    try {
      const bundlePathOnPhone = await this.createAppPath(afcService, app);
      const promises = [];
      await fs.walkDir(app, true, async (itemPath, isDir) => {
        const pathOnPhone = path.join(bundlePathOnPhone, path.relative(app, itemPath));
        if (isDir) {
          await afcService.createDirectory(pathOnPhone);
        } else {
          const readStream = fs.createReadStream(itemPath, {autoClose: true});
          const writeStream = await afcService.createWriteStream(pathOnPhone, {autoDestroy: true });
          writeStream.on('finish', writeStream.destroy);
          promises.push(new B((resolve) => writeStream.on('close', resolve)));
          readStream.pipe(writeStream);
        }
      });
      try {
        await B.all(promises).timeout(APPLICATION_PUSH_TIMEOUT);
      } catch (e) {
        throw new Error(`Couldn't push all the files within the timeout ${APPLICATION_PUSH_TIMEOUT}ms`);
      }
      log.debug(`Pushed the app files successfully after ${new Date() - start}ms`);
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

  async installApp (app) {
    await this.install(app);
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
}

export default IOSDeploy;
