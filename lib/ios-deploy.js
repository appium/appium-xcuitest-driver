import { exec } from 'teen_process';
import { fs } from 'appium-support';
import logger from './logger';

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
    let remove = [`--uninstall_only`, `--id`, this.udid, `--bundle_id`, bundleid];
    try {
      await exec(this.cmd, remove);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);
      throw new Error(`Could not remove app: '${err.message}'`);
    }
  }

  async removeApp (bundleId) {
    await this.remove(bundleId);
  }

  async install (app) {
    let install = [`--id`, this.udid, `--uninstall`, `--bundle`, app];
    try {
      await exec(this.cmd, install);
    } catch (err) {
      throw new Error(`Could not install app: '${err.message}'`);
    }
  }

  async isAppInstalled (bundleid) {
    let isInstalled = [`--exists`, `--id`, this.udid, `--bundle_id`, bundleid];
    try {
      let {stdout} = await exec(this.cmd, isInstalled);
      return (stdout && (stdout.indexOf("true") > -1));
    } catch (err) {
      // error 255 is just ios-deploy's way of saying it is not installed
      if (err.code !== 255) {
        logger.debug(`Error checking install status: '${err.message}'`);
      }
      return false;
    }
  }
}

export default IOSDeploy;
