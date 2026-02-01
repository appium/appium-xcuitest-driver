import {fs, logger, zip, net, node} from 'appium/support.js';
import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import {parseArgValue} from './utils.js';

const log = logger.getLogger('download-wda-sim');
const wdaUrl = (version, zipFileName) =>
  `https://github.com/appium/WebDriverAgent/releases/download/v${version}/${zipFileName}`;
const destZip = (platform) => {
  const scheme = `WebDriverAgentRunner${_.toLower(platform) === 'tvos' ? '_tvOS' : ''}`;
  return `${scheme}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
};

/**
 * Return installed appium-webdriveragent package version
 * @returns {Promise<number>}
 */
async function webdriveragentPkgVersion() {
  const moduleRoot = node.getModuleRootSync('appium-xcuitest-driver', import.meta.url);
  if (!moduleRoot) {
    throw new Error('Cannot resolve module root for appium-xcuitest-driver');
  }
  const pkgPath = path.join(
    moduleRoot,
    'node_modules',
    'appium-webdriveragent',
    'package.json'
  );
  return JSON.parse(await fs.readFile(pkgPath, 'utf8')).version;
};

/**
 * Prepare the working root directory.
 * @returns {Promise<string>} Root directory to download and unzip.
 */
async function prepareRootDir() {
  const destDirRoot = parseArgValue('outdir');
  if (!destDirRoot) {
    throw new Error(`--outdir is required`);
  }
  const destDir = path.resolve(process.cwd(), destDirRoot);
  if (await fs.exists(destDir)) {
    throw new Error(`${destDir} already exists`);
  }
  await fs.mkdir(destDir, {recursive: true});
  return destDir;
}

async function getWDAPrebuiltPackage() {
  const destDir = await prepareRootDir();
  const platform = parseArgValue('platform');
  const zipFileName = destZip(platform);
  const wdaVersion = await webdriveragentPkgVersion();
  const urlToDownload = wdaUrl(wdaVersion, zipFileName);
  const downloadedZipFile = path.join(destDir, zipFileName);
  try {
    log.info(`Downloading ${urlToDownload}`);
    await net.downloadFile(urlToDownload, downloadedZipFile);

    log.info(`Unpacking ${downloadedZipFile} into ${destDir}`);
    await zip.extractAllTo(downloadedZipFile, destDir);

    log.info(`Deleting ${downloadedZipFile}`);
  } finally {
    if (await fs.exists(downloadedZipFile)) {
      await fs.unlink(downloadedZipFile);
    }
  }
}

(async () => await getWDAPrebuiltPackage())();
