import { exec } from 'teen_process';
import logger from './logger';

const FRUITSAP_PATH = 'fruitstrap';

class Fruitstrap {
 
  constructor (udid, fruitstrapPath) {
    this.udid = udid;
    this.fruitstrapPath = fruitstrapPath || FRUITSAP_PATH;
  }

  async remove (bundleid) {
    let remove = [`uninstall`, `--id`, this.udid, `--bundle`, bundleid];
    try {
      let {stdout} = await exec(this.fruitstrapPath, remove, { maxBuffer: 524288});
      logger.debug(`app uninstall stdout : ${stdout}`);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      throw new Error(`coulld not remove app ${err.message}`);
    }
  }

  async install (app) {
    let install = [`install`, `--id`, this.udid, `--bundle`, app]; 
    try {
      let {stdout} =  await exec(this.fruitstrapPath, install, { maxBuffer: 524288});
      logger.debug(`app install stdout : ${stdout}`);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      throw new Error(`could not install app ${err.message}`);
    }       
  }

  async installAndWait (ipa, bundleid) {
    throw new Error(`Can't install ${bundleid}. Installing ipa ${ipa} files is not supported at this time`);      
  }

  async isInstalled (bundleid) {
    let isInstalled = [`isInstalled`, `--id`, this.udid, `--bundle`, bundleid];
    try {
      let {stdout} = await exec(this.fruitstrapPath, isInstalled, { maxBuffer: 524288});
      logger.debug(`app isInstalled stdout : ${stdout}`);
      return true;
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      return false;
    }          
  }
}

export default Fruitstrap;