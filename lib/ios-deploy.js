import { exec } from 'teen_process';
import { fs } from 'appium-support';
import logger from './logger';
import { retryInterval } from 'asyncbox';

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
      logger.debug(`Stdout: '${err.stdout}'. Stderr: '${err.stderr}'.`);
      throw new Error(`Could not remove app: '${err.message}'`);
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
    let installStatusArgs = [`--exists`, `--id`, this.udid, `--bundle_id`, bundleid];
    try {
      logger.debug(`Calling: '${this.cmd} ${installStatusArgs.join(' ')}'`);
      let {stdout} = await exec(this.cmd, installStatusArgs);
      logger.debug(`Stdout: '${stdout}'`);
      return (stdout && (stdout.includes('true')));
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
