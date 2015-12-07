import xcode from 'appium-xcode';
import { fs } from 'appium-support';
import { exec } from 'teen_process';
import logger from './logger';
import path from 'path';


const SAFARI_LAUNCHER_DIR = path.resolve(__dirname, '..', '..',
                                              'build', 'SafariLauncher');
const SAFARI_LAUNCHER_APP_FILE = path.resolve(__dirname, '..', '..',
                                              'build', 'SafariLauncher',
                                              'SafariLauncher.app');
const SAFARI_LAUNCHER_REPO = path.resolve(__dirname, '..', '..',
                                          'node_modules', 'safari-launcher');
const SAFARI_LAUNCHER_CONFIG_FILE = path.resolve(SAFARI_LAUNCHER_REPO, 'build.xconfig');
const SAFARI_LAUNCHER_BUNDLE = 'com.bytearc.SafariLauncher';

const sdks = ['iphoneos'];

async function cleanApp (appRoot, sdk) {
  logger.debug(`Cleaning SafariLauncher for ${sdk}`);
  try {
    await exec('xcodebuild', ['-sdk', sdk, 'clean'], {cwd: appRoot});
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

async function cleanAll () {
  logger.info("Cleaning SafariLauncher");
  let sdkVer = await xcode.getMaxIOSSDK();
  for(let sdk of sdks) {
    let fullSdk = sdk+sdkVer;
    await cleanApp(SAFARI_LAUNCHER_REPO, fullSdk);
  }
  await fs.rimraf(SAFARI_LAUNCHER_DIR);
  logger.info("Finished cleaning SafariLauncher");
}

async function buildApp(appRoot, sdk) {
  try {
    logger.debug(`Building SafariLauncher for ${sdk}`);
    let args = ['-sdk', sdk, '-xcconfig', SAFARI_LAUNCHER_CONFIG_FILE];
    await exec('xcodebuild', args, {
      cwd: appRoot
    });
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

async function buildAll () {
  logger.info("Building SafariLauncher");
  let sdkVer = await xcode.getMaxIOSSDK();
  for (let sdk of sdks) {
    let fullSdk = sdk + sdkVer;
    await buildApp(SAFARI_LAUNCHER_REPO, fullSdk);
  }
  logger.info("Finished building SafariLauncher");
 }

async function renameAll () {
  try {
    logger.info("Renaming SafariLauncher");
    if (!await fs.exists(SAFARI_LAUNCHER_DIR)) {
      await fs.mkdir(SAFARI_LAUNCHER_DIR);
    }

    let file = path.resolve(SAFARI_LAUNCHER_REPO, 'build', 'Release-iphoneos', 'SafariLauncher.app');
    await fs.rename(
      file,
      SAFARI_LAUNCHER_APP_FILE);
    logger.info("Finished renaming SafariLauncher");
  } catch (err) {
    logger.warn("Could not rename SafariLauncher");
    logger.errorAndThrow(err);
  }
}

async function updateConfig () {
  logger.info('Updating config for Safari Launcher');
  let config = `BUNDLE_ID = ${SAFARI_LAUNCHER_BUNDLE}
IDENTITY_NAME = iPhone Developer
IDENTITY_CODE =`;
  await fs.writeFile(SAFARI_LAUNCHER_CONFIG_FILE, config);
}

async function install () {
  await cleanAll();
  await updateConfig();
  await buildAll();
  await renameAll();
}

async function needsInstall () {
  logger.debug(`Checking for presence of SafariLauncher at '${SAFARI_LAUNCHER_APP_FILE}'`);
  let exists = await fs.exists(SAFARI_LAUNCHER_APP_FILE);
  logger.debug(`SafariLauncher ${exists ? 'exists' : 'does not exist'}`);
  return !exists;
}


export { install, needsInstall, SAFARI_LAUNCHER_APP_FILE, SAFARI_LAUNCHER_BUNDLE };
