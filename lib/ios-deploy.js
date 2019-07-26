/* eslint-disable promise/prefer-await-to-callbacks */
import { fs } from 'appium-support';
import path from 'path';
import { services } from 'appium-ios-device';
import B from 'bluebird';

const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const INSTALLATION_STAGING_DIR = 'PublicStaging';
const APPLICATION_PUSH_TIMEOUT = 60 * 1000;

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
    try {
      const bundlePathOnPhone = await this.pushAppBundle(app);
      await this.installApplcation(bundlePathOnPhone);
    } catch (err) {
      throw new Error(`Could not install app: '${err.message}'`);
    }
  }

  async installApplcation (bundlePathOnPhone) {
    const notificationService = await services.startNotificationProxyService(this.udid);
    const installationService = await services.startInstallationProxyService(this.udid);
    const appInstalledNotification = new B((resolve) => {
      notificationService.observeNotification(APPLICATION_INSTALLED_NOTIFICATION, { notification: resolve });
    });
    try {
      await installationService.installApplication(bundlePathOnPhone, { PackageType: 'Developer'});
      await appInstalledNotification;
    } finally {
      installationService.close();
      notificationService.close();
    }
  }

  async pushAppBundle (app) {
    const afcService = await services.startAfcService(this.udid);
    try {
      const bundlePathOnPhone = await this.createAppPath(afcService, app);
      const promises = [];
      await this.walkDir(app, async (itemPath, isDir) => {
        const pathOnPhone = path.join(bundlePathOnPhone, path.relative(app, itemPath));
        if (isDir) {
          await afcService.createDirectory(pathOnPhone);
        } else {
          const readStream = fs.createReadStream(itemPath, {autoClose: true});
          const writeStream = await afcService.createWriteStream(pathOnPhone, {autoDestroy: true });
          promises.push(new B((resolve) => writeStream.on('close', resolve)));
          readStream.pipe(writeStream);
        }
      });
      await B.all(promises).timeout(APPLICATION_PUSH_TIMEOUT);
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

  async walkDir (dir, callback) {
    for (const file of await fs.readdir(dir, { withFileTypes: true })) {
      const itemPath = path.join(dir, file.name);
      const isDirectory = file.isDirectory();
      await callback(itemPath, isDirectory);
      if (!isDirectory) {
        continue;
      }
      await this.walkDir(itemPath, callback);
    }
  }

  async installApp (app) {
    await this.install(app);
  }

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
