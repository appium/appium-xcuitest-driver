import {fs, logger, zip, net, node} from 'appium/support.js';
import _ from 'lodash';
import os from 'node:os';
import path from 'node:path';
import {Command} from 'commander';

const log = logger.getLogger('download-wda-sim');
const wdaUrl = (/** @type {string} */ version, /** @type {string} */ zipFileName) =>
  `https://github.com/appium/WebDriverAgent/releases/download/v${version}/${zipFileName}`;
const destZip = (/** @type {string} */ platform) => {
  const scheme = `WebDriverAgentRunner${_.toLower(platform) === 'tvos' ? '_tvOS' : ''}`;
  return `${scheme}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
};

/**
 * Return installed appium-webdriveragent package version
 * @returns {Promise<string>}
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
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  return String(pkg.version);
};

/**
 * Prepare the working root directory.
 * @param {string} outdir
 * @returns {Promise<string>} Root directory to download and unzip.
 */
async function prepareRootDir(outdir) {
  const destDir = path.resolve(process.cwd(), outdir);
  if (await fs.exists(destDir)) {
    throw new Error(`${destDir} already exists`);
  }
  await fs.mkdir(destDir, {recursive: true});
  return destDir;
}

/**
 * @param {DownloadOptions} options
 */
async function getWDAPrebuiltPackage(options) {
  const destDir = await prepareRootDir(options.outdir);
  const zipFileName = destZip(options.platform);
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

async function main() {
  const program = new Command();

  program
    .name('appium driver run xcuitest download-wda-sim')
    .description('Download a prebuilt WebDriverAgentRunner for iOS/tvOS simulator')
    .requiredOption('--outdir <path>', 'Destination directory to download and unpack into')
    .requiredOption(
      '--platform <platform>',
      'Target platform (e.g. iOS or tvOS)',
      (value) => value,
    )
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Download WDA for iOS simulator
  appium driver run xcuitest download-wda-sim --outdir ./wda-sim --platform iOS

  # Download WDA for tvOS simulator
  appium driver run xcuitest download-wda-sim --outdir ./wda-sim-tvos --platform tvOS`,
    )
    .action(async (options) => {
      await getWDAPrebuiltPackage(options);
    });

  await program.parseAsync(process.argv);
}

await main();

/**
 * @typedef {Object} DownloadOptions
 * @property {string} outdir
 * @property {string} platform
 */
