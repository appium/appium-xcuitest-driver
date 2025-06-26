import {fs, logger, zip, net, node} from 'appium/support';
import _ from 'lodash';
import os from 'os';
import path from 'path';
import { parseArgValue } from './utils.mjs';

const log = logger.getLogger('WDA');
const wdaUrl = (version, zipFileName) =>
  `https://github.com/appium/WebDriverAgent/releases/download/v${version}/${zipFileName}`;
const destZip = (platform) => {
  const scheme = `WebDriverAgentRunner${_.toLower(platform) === 'tvos' ? '_tvOS' : ''}`;
  return `${scheme}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
};

/**
 * Return installed appium-webdriveragent package version
 * @returns {number}
 */
async function webdriveragentPkgVersion() {
  const pkgPath = path.join(
    node.getModuleRootSync('appium-xcuitest-driver', import.meta.url),
    'node_modules',
    'appium-webdriveragent',
    'package.json'
  );
  return JSON.parse(await fs.readFile(pkgPath, 'utf8')).version;
};

/**
 * Unzip the given zipPath into the destDir.
 * @param {string} zipPath Path of zip file
 * @param {string} destDir Path to unzip.
 */
async function unzipFile(zipPath, destDir) {
  await fs.mkdir(destDir, {recursive: true});
  await zip.extractAllTo(zipPath, destDir);
  await fs.unlink(zipPath);
}


async function getWDAPrebuiltPackage() {
  const destDirPath = parseArgValue('outdir');
  if (!destDirPath) {
    log.error(`--outdir is required`);
    process.exit(1);
  }

  const platform = parseArgValue('platform');
  const zipFileName = destZip(platform);
  const wdaVersion = await webdriveragentPkgVersion();

  const urlToDownload = wdaUrl(wdaVersion, zipFileName);

  log.info(`Downloading ${urlToDownload}`);
  await net.downloadFile(urlToDownload, zipFileName);

  const destination = path.resolve(destDirPath);
  log.info(`Unpacking ${zipFileName} into ${destination}`);
  await unzipFile(zipFileName, destination);
  process.exit(0);
}


(async () => await getWDAPrebuiltPackage())();
