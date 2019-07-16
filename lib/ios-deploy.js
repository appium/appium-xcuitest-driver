import { exec } from 'teen_process';
import { fs } from 'appium-support';
import logger from './logger';
import { retryInterval } from 'asyncbox';
import { services } from 'appium-ios-device';

const IOSDEPLOY_PATH = `ios-deploy`;

class IOSDeploy {

  constructor (udid) {
    this.udid = udid;
    this.cmd = IOSDEPLOY_PATH; // this.cmd is in accordance with iDevice
  }

  async checkStatus () {
    // make sure we actually have the program
    await fs.which(this.cmd);
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
    const args = [`--id`, this.udid, `--bundle`, app];
    try {
      await retryInterval(5, 500, exec, this.cmd, args);
    } catch (err) {
      logger.debug(`Stdout: '${err.stdout}'. Stderr: '${err.stderr}'.`);
      throw new Error(`Could not install app: '${err.message}'`);
    }
  }

  async installApp (app) {
    await this.install(app);
  }

  async isAppInstalled (bundleid) {
    const service = await services.startInstallationProxyService(this.udid);
    try {
      const applications = await service.listApplications();
      return !!applications[bundleid];
    } finally {
      service.close();
    }
  }
}

export default IOSDeploy;
