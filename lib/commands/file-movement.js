import path from 'path';
import { system } from 'appium-support';
import { exec } from 'teen_process';
import { iosCommands } from 'appium-ios-driver';
import log from '../logger';


let commands = iosCommands.file;

commands.getSimFileFullPath = async function (remotePath) {
  let basePath = this.opts.device.getDir();
  let appName = null;

  if (this.opts.app) {
    let appNameRegex = new RegExp(`\\${path.sep}([\\w-]+\\.app)`);
    let appNameMatches = appNameRegex.exec(this.opts.app);
    if (appNameMatches) {
      appName = appNameMatches[1];
    }
  }
  // de-absolutize the path
  if (system.isWindows()) {
    if (remotePath.indexof('://') === 1) {
      remotePath = remotePath.slice(4);
    }
  } else {
    if (remotePath.indexOf('/') === 0) {
      remotePath = remotePath.slice(1);
    }
  }

  if (remotePath.indexOf(appName) === 0) {
    let findPath = basePath;
    if (this.opts.platformVersion >= 8) {
      // the .app file appears in /Containers/Data and /Containers/Bundle both. We only want /Bundle
      findPath = path.resolve(basePath, 'Containers', 'Bundle');
    }
    findPath =  findPath.replace(/\s/g, '\\ ');

    let { stdout } = await exec('find', [findPath, '-name', appName]);
    let appRoot = stdout.replace(/\n$/, '');
    let subPath = remotePath.substring(appName.length + 1);
    let fullPath = path.resolve(appRoot, subPath);
    log.debug(`Finding app-relative file: '${fullPath}'`);
    return fullPath;
  } else {
    let fullPath = path.resolve(basePath, remotePath);
    log.debug(`Finding sim-relative file: ${fullPath}`);
    return fullPath;
  }
};


export { commands };
export default commands;
