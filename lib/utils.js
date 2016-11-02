import { fs } from 'appium-support';
import { exec } from 'teen_process';
import xcode from 'appium-xcode';
import log from './logger';


async function detectUdid () {
  log.debug('Auto-detecting real device udid...');
  let  cmd, args = [];
  try {
    cmd = await fs.which('idevice_id');
    args.push('-l');
    log.debug('Using idevice_id');
  } catch (err) {
    log.debug('Using udidetect');
    cmd = require.resolve('udidetect');
  }
  let udid;
  try {
    let {stdout} = await exec(cmd, args, {timeout: 3000});
    udid = stdout.split('\n')[0];
  } catch (err) {
    log.errorAndThrow(`Error detecting udid: ${err.message}`);
  }
  if (!udid || udid.length <= 2) {
    throw new Error('Could not detect udid.');
  }
  log.debug(`Detected real device udid: '${udid}'`);
  return udid;
}

async function getAndCheckXcodeVersion () {
  let version;
  try {
    version = await xcode.getVersion(true);
  } catch (err) {
    log.debug(err);
    log.errorAndThrow(`Could not determine Xcode version: ${err.message}`);
  }

  // we do not support Xcodes < 7.3,
  if (version.versionFloat < 7.3) {
    log.warn( `Xcode version '${version.versionString}'. Support for Xcode ` +
              `${version.versionString} has been deprecated and will be removed ` +
              `in a future version. Please upgrade to version 7 or higher`);
  }
  return version;
}

async function getAndCheckIosSdkVersion () {
  let versionNumber;
  try {
    versionNumber = await xcode.getMaxIOSSDK();
  } catch (err) {
    log.errorAndThrow(`Could not determine iOS SDK version: ${err.message}`);
  }
  return versionNumber;
}

async function killAppUsingAppName (udid, appName) {
  let psArgs = [`-c`, `ps -ax|grep -i "${appName}"|grep -i "${udid}"|grep -v grep|awk '{print "kill -9 " $1}'|sh`];
  try {
    await exec(`bash`, psArgs);
  } catch (err) {
    log.debug(`Error : ${err.message}`);
  }
}

export { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion, killAppUsingAppName };
