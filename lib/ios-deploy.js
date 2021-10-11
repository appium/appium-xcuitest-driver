import { fs, timing, util } from 'appium-support';
import path from 'path';
import { services, utilities } from 'appium-ios-device';
import B from 'bluebird';
import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { extractBundleId } from './app-utils';

const APPLICATION_INSTALLED_NOTIFICATION = 'com.apple.mobile.application_installed';
const INSTALLATION_STAGING_DIR = 'PublicStaging';
const DEFAULT_ITEM_PUSH_TIMEOUT_MS = 2 * 60 * 1000;
const APPLICATION_NOTIFICATION_TIMEOUT_MS = 30 * 1000;
const IOS_DEPLOY_TIMEOUT_MS = 4 * 60 * 1000;
const IOS_DEPLOY = 'ios-deploy';
const APP_INSTALL_STRATEGY = Object.freeze({
  SERIAL: 'serial',
  PARALLEL: 'parallel',
  IOS_DEPLOY,
});
// Mobile devices use NAND memory modules for the storage,
// and the parallelism there is not as performant as on regular SSDs
const MAX_PUSH_CHUNK_SIZE = 8;


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
      try {
        const bundlePathOnPhone = await this.pushAppBundle(app, {
          timeoutMs: timeout,
          enableParallelPush: _.toLower(strategy) === APP_INSTALL_STRATEGY.PARALLEL,
        });
        const bundleId = await extractBundleId(app);
        await this.installOrUpgradeApplication(bundlePathOnPhone, await this.isAppInstalled(bundleId));
      } catch (err) {
        log.warn(`Error installing app '${app}': ${err.message}`);
        log.warn(`Falling back to '${IOS_DEPLOY}' usage`);
        try {
          await installWithIosDeploy();
        } catch (err1) {
          throw new Error(`Could not install '${app}':\n` +
            `  - ${err.message}\n` +
            `  - ${err1.message}`);
        }
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

  async pushAppBundle (app, opts = {}) {
    const {
      timeoutMs = DEFAULT_ITEM_PUSH_TIMEOUT_MS,
      // We are pushing serially by default due to the issue https://github.com/appium/appium/issues/13115
      enableParallelPush = false,
    } = opts;

    const timer = new timing.Timer().start();
    const itemsToPush = await fs.glob('**', {
      cwd: app,
      nosort: true,
      mark: true,
    });
    log.debug(`Successfully scanned the tree structure of '${path.basename(app)}' app`);
    const [foldersToPush, filesToPush] = itemsToPush.reduce((acc, x) => {
      acc[_.endsWith(x, path.sep) ? 0 : 1].push(x);
      return acc;
    }, [[], []]);
    log.debug(`Got ${util.pluralize('folder', foldersToPush.length, true)} and ` +
      `${util.pluralize('file', filesToPush.length, true)} to push`);
    const afcService = await services.startAfcService(this.udid);
    try {
      const bundlePathOnPhone = await this.createAppPath(afcService, app);
      // top-level folders must go first
      const foldersToPushByHierarchy = foldersToPush
        .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
      // create the folder structure first
      for (const relativeFolderPath of foldersToPushByHierarchy) {
        // createDirectory does not accept folder names ending with a path separator
        const absoluteFolderPath = _.trimEnd(
          path.join(bundlePathOnPhone, relativeFolderPath), path.sep
        );
        if (absoluteFolderPath) {
          await afcService.createDirectory(absoluteFolderPath);
        }
      }
      // do not forget about the root app folder
      log.debug(`Successfully created the remote folder structure ` +
        `(${util.pluralize('item', foldersToPush.length + 1, true)})`);

      const pushFile = async (relativePath) => {
        const absoluteSourcePath = path.join(app, relativePath);
        const readStream = fs.createReadStream(absoluteSourcePath, {autoClose: true});
        const absoluteDestinationPath = path.join(bundlePathOnPhone, relativePath);
        const writeStream = await afcService.createWriteStream(absoluteDestinationPath, {
          autoDestroy: true
        });
        writeStream.on('finish', writeStream.destroy);
        let pushError = null;
        const filePushPromise = new B((resolve, reject) => {
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
        await filePushPromise.timeout(timeoutMs,
          `Could not push '${absoluteSourcePath}' within the timeout of ${timeoutMs}ms. ` +
          `Consider increasing the value of 'appPushTimeout' capability.`);
      };

      if (enableParallelPush) {
        log.debug(`Proceeding to parallel files push (max ${MAX_PUSH_CHUNK_SIZE} writers)`);
        const pushPromises = [];
        for (const relativeFilePath of _.shuffle(filesToPush)) {
          pushPromises.push(B.resolve(pushFile(relativeFilePath)));
          // keep the push queue filled
          if (pushPromises.length >= MAX_PUSH_CHUNK_SIZE) {
            await B.any(pushPromises);
          }
          _.remove(pushPromises, (p) => p.isFulfilled());
        }
        if (!_.isEmpty(pushPromises)) {
          // handle the rest of push promises
          await B.all(pushPromises);
        }
      } else {
        log.debug(`Proceeding to serial files push`);
        for (const relativeFilePath of filesToPush) {
          await pushFile(relativeFilePath);
        }
      }

      log.debug(`Successfully pushed ${util.pluralize('app folder', foldersToPush.length, true)} ` +
        `and ${util.pluralize('app file', filesToPush.length, true)} ` +
        `within ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
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
