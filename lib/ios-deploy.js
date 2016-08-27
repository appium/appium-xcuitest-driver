import { exec } from 'teen_process';
import logger from './logger';

const IOSDEPLOY_PATH = `ios-deploy`;

class IOSDeploy {
 
  constructor (udid) {
    this.udid = udid;
    this.cmd = IOSDEPLOY_PATH;// this.cmd is in accordance with iDevice
  }

  async remove (bundleid) {
    let remove = [`--uninstall_only`, `--id`, this.udid, `--bundle_id`, bundleid];
    try {
      let {stdout} = await exec(this.cmd, remove, { maxBuffer: 524288});
      logger.debug(`app uninstall stdout : ${stdout}`);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      throw new Error(`coulld not remove app ${err.message}`);
    }
  }

  async install (app) {
    let install = [`--id`, this.udid, `--uninstall`, `--bundle`, app]; 
    try {
      let {stdout} =  await exec(this.cmd, install, { maxBuffer: 524288});
      logger.debug(`app install stdout : ${stdout}`);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      throw new Error(`could not install app ${err.message}`);
    }       
  }

  async isInstalled (bundleid) {
    let isInstalled = [`--exists`, `--id`, this.udid, `--bundle_id`, bundleid];
    try {
      let {stdout} = await exec(this.cmd, isInstalled, { maxBuffer: 524288});
      logger.debug(`app isInstalled stdout : ${stdout}`);
      return (stdout && (stdout.indexOf("true") > -1));
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      return false;
    }          
  }
}

export default IOSDeploy;