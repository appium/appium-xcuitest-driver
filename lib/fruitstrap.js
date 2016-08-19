import path from 'path';
import { exec } from 'teen_process';
import logger from './logger';

const FRUITSAP_PATH = path.resolve(__dirname, '..', '..', 'bin', 'fruitstrap');

class Fruitstrap {
 
  constructor (udid, opts = {}) {
    this.udid = udid;
    this.fruitstrapPath = opts.path || FRUITSAP_PATH;
  }

  async remove (bundleid) {
    let remove = [`uninstall`, `--id`, `${this.udid}`, `--bundle`, `${bundleid}`];
    try {
      let {stdout} = await exec(`${this.fruitstrapPath}`, remove, { maxBuffer: 524288});
      logger.debug(`app uninstall stdout : ${stdout}`);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      new Error(`coulld not remove app ${err.message}`);
    }
  }

  async install(app) {
    let install = [`install`, `--id`, `${this.udid}`, `--bundle`, `${app}`]; 
    try {
      let {stdout} =  await exec(`${this.fruitstrapPath}`, install, { maxBuffer: 524288});
      logger.debug(`app install stdout : ${stdout}`);
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      new Error(`coulld not install app ${err.message}`);
    }       
  }

  async isInstalled(bundleid) {
    let isInstalled = [`isInstalled`, `--id`, `${this.udid}`, `--bundle`, `${bundleid}`];
    try {
      let {stdout} = await exec(`${this.fruitstrapPath}`, isInstalled, { maxBuffer: 524288});
      logger.debug(`app isInstalled stdout : ${stdout}`);
      return true;
    } catch (err) {
      logger.debug(`Error : ${err.message}`);  
      return false;
    }          
  }
}

export default Fruitstrap;