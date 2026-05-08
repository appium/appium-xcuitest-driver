import {fs, logger, zip, net, node} from 'appium/support.js';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Command} from 'commander';

const log = logger.getLogger('download-wda');
const WDA_KIND_REAL = 'real';
const WDA_KIND_SIM = 'sim';

const wdaUrl = (/** @type {string} */ version, /** @type {string} */ zipFileName) =>
  `https://github.com/appium/WebDriverAgent/releases/download/v${version}/${zipFileName}`;

/**
 * @param {DownloadOptions} options
 */
export async function getWDAPrebuiltPackage(options) {
  const kind = normalizeKind(options.kind);
  const destDir = await prepareRootDir(options.outdir);
  const zipFileName = destZip(options.platform, kind);
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

/**
 * @param {string | undefined} kind
 * @returns {'real' | 'sim'}
 */
function normalizeKind(kind) {
  const normalized = String(kind || WDA_KIND_REAL).toLowerCase();
  if (normalized !== WDA_KIND_REAL && normalized !== WDA_KIND_SIM) {
    throw new Error(`Unsupported kind '${kind}'. Supported values are '${WDA_KIND_REAL}' and '${WDA_KIND_SIM}'`);
  }
  return /** @type {'real' | 'sim'} */ (normalized);
}

const destZip = (/** @type {string} */ platform, /** @type {'real' | 'sim'} */ kind) => {
  const scheme = `WebDriverAgentRunner${String(platform).toLowerCase() === 'tvos' ? '_tvOS' : ''}`;
  if (kind === WDA_KIND_SIM) {
    return `${scheme}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
  }
  return `${scheme}-Runner.zip`;
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

async function main() {
  const program = new Command();

  program
    .name('appium driver run xcuitest download-wda')
    .description('Download a prebuilt WebDriverAgentRunner for iOS/tvOS real devices or simulators')
    .requiredOption('--outdir <path>', 'Destination directory to download and unpack into')
    .requiredOption(
      '--platform <platform>',
      'Target platform (e.g. iOS or tvOS)',
      (value) => value,
    )
    .option(
      '--kind <kind>',
      `Target package type: ${WDA_KIND_REAL} (real devices) or ${WDA_KIND_SIM} (simulators)`
    )
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Download WDA for iOS real device (default)
  appium driver run xcuitest download-wda --outdir ./wda-real --platform iOS


  # Download WDA for tvOS simulator
  appium driver run xcuitest download-wda --outdir ./wda-sim-tvos --platform tvOS --kind sim`,
    )
    .action(async (options) => {
      await getWDAPrebuiltPackage({
        ...options,
        kind: options.kind ?? WDA_KIND_REAL,
      });
    });

  await program.parseAsync(process.argv);
}

const isMainModule =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}

/**
 * @typedef {Object} DownloadOptions
 * @property {string} outdir
 * @property {string} platform
 * @property {string | undefined} [kind]
 */
