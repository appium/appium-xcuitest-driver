import { fs, tempDir } from 'appium-support';
import path from 'path';
import { exec } from 'teen_process';
import xcode from 'appium-xcode';
import _ from 'lodash';
import log from './logger';


const WDA_DERIVED_DATA_SEARCH_SUFFIX = 'Library/Developer/Xcode/DerivedData/WebDriverAgent-*';
const WDA_ATTACHMENTS_FOLDER_RELATIVE_PATH = 'Logs/Test/Attachments';

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
    let udids = _.filter(stdout.split('\n'), Boolean);
    udid = _.last(udids);
    if (udids.length > 1) {
      log.warn(`Multiple devices found: ${udids.join(', ')}`);
      log.warn(`Choosing '${udid}'. If this is wrong, manually set with 'udid' desired capability`);
    }
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
    log.warn(`Xcode version '${version.versionString}'. Support for Xcode ` +
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

async function adjustWDAAttachmentsPermissions (perms) {
  if (!process.env.HOME) {
    throw new Error('Need HOME env var to be set in order to adjust WDA attachments permission');
  }
  let derivedDataSearchMask = path.join(process.env.HOME, WDA_DERIVED_DATA_SEARCH_SUFFIX);
  let folders = await fs.glob(derivedDataSearchMask);
  let changesMade = false;
  for (let folder of folders) {
    log.debug(`Found WDA derived data folder: '${folder}'`);
    let attachmentsFolder = path.join(folder, WDA_ATTACHMENTS_FOLDER_RELATIVE_PATH);
    if (await fs.exists(attachmentsFolder)) {
      log.info(`Setting '${perms}' permissions to '${attachmentsFolder}' folder`);
      await fs.chmod(attachmentsFolder, perms);
      changesMade = true;
    }
  }
  if (!changesMade) {
    log.info('No WDA derived data folders have been found.');
  }
}

async function generateXcodeConfigFile (orgId, signingId) {
  log.debug(`Generating xcode config file for orgId '${orgId}' and signingId ` +
            `'${signingId}'`);
  let contents = `DEVELOPMENT_TEAM = ${orgId}
CODE_SIGN_IDENTITY = ${signingId}
`;
  let xcconfigPath = await tempDir.path('appium-temp.xcconfig');
  log.debug(`Writing xcode config file to ${xcconfigPath}`);
  await fs.writeFile(xcconfigPath, contents, "utf8");
  return xcconfigPath;
}

async function checkAppPresent (app) {
  log.debug(`Checking whether app '${app}' is actually present on file system`);
  if (!(await fs.exists(app))) {
    log.errorAndThrow(`Could not find app at '${app}'`);
  }
  log.debug('App is present');
}

export { detectUdid, getAndCheckXcodeVersion, getAndCheckIosSdkVersion,
         killAppUsingAppName, adjustWDAAttachmentsPermissions,
         generateXcodeConfigFile, checkAppPresent };
