const fs = require('fs/promises');
const path = require('path');
const { exec } = require('teen_process');
const log = require('fancy-log');
const WDA_INDEX_PATH = require.resolve('appium-webdriveragent');
const XCODEPROJ_NAME = 'WebDriverAgent.xcodeproj';


async function getXcodeprojPath () {
  const pathParts = WDA_INDEX_PATH.split(path.sep).map((x) => x === '' ? path.sep : x);
  for (let i = -1; i > -pathParts.length; i--) {
    const currentPath = path.join(...pathParts.slice(-pathParts.length, i), XCODEPROJ_NAME);
    try {
      await fs.access(currentPath, fs.constants.R_OK);
      return currentPath;
    } catch (ign) {}
  }
  throw new Error(`Cannot find '${XCODEPROJ_NAME}' under '${WDA_INDEX_PATH}' hierarchy`);
}

async function openWda () {
  const dstPath = await getXcodeprojPath();
  log.info(`Opening '${dstPath}' in Xcode`);
  await exec('open', [dstPath]);
}

(async () => await openWda())();
