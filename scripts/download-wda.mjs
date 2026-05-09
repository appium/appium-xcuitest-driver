import {fs, logger, zip, net, node} from 'appium/support.js';
import {constants as fsConstants, promises as fsPromises} from 'node:fs';
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
 * Download and unpack a prebuilt WDA package for the given platform and kind.
 * @param {DownloadOptions} options
 * @returns {Promise<void>}
 */
export async function getWDAPrebuiltPackage(options) {
  const kind = normalizeKind(options.kind);
  const destDir = await prepareRootDir(options.outdir);
  const zipFileName = destZip(options.platform, kind);
  const wdaVersion = await getWebdriveragentPkgVersion();
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

const destZip = (/** @type {string} */ platform, /** @type {WDAKind} */ kind) => {
  const scheme = `WebDriverAgentRunner${String(platform).toLowerCase() === 'tvos' ? '_tvOS' : ''}`;
  if (kind === WDA_KIND_SIM) {
    return `${scheme}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
  }
  return `${scheme}-Runner.zip`;
};

/**
 * Normalize the kind value, ensuring it is either 'real' or 'sim'. Default to 'real' if undefined.
 * @param {string | undefined} kind
 * @returns {WDAKind}
 */
function normalizeKind(kind) {
  const normalized = String(kind || WDA_KIND_REAL).toLowerCase();
  if (![WDA_KIND_REAL, WDA_KIND_SIM].includes(normalized)) {
    throw new Error(`Unsupported kind '${kind}'. Supported values are '${WDA_KIND_REAL}' and '${WDA_KIND_SIM}'`);
  }
  return /** @type {WDAKind} */ (normalized);
}

/**
 * Return installed appium-webdriveragent package version
 * @returns {Promise<string>}
 */
async function getWebdriveragentPkgVersion() {
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
  if (!pkg.version || typeof pkg.version !== 'string') {
    throw new Error(`Cannot find version in ${pkgPath}`);
  }
  return pkg.version;
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

  const parentDir = path.dirname(destDir);
  try {
    await fsPromises.access(parentDir, fsConstants.W_OK);
  } catch (err) {
    throw new Error(`Parent directory '${parentDir}' is not writable`, {
      cause: err,
    });
  }

  try {
    await fs.mkdir(destDir, {recursive: true});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot create directory '${destDir}': ${message}`, {
      cause: err,
    });
  }
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
      `Target package type: ${WDA_KIND_REAL} (real devices) or ${WDA_KIND_SIM} (simulators). Default: ${WDA_KIND_REAL}`,
    )
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Download WDA for iOS real device (default)
  appium driver run xcuitest download-wda -- --outdir ./wda-real --platform iOS

  # Download WDA for tvOS simulator
  appium driver run xcuitest download-wda -- --outdir ./wda-sim-tvos --platform tvOS --kind sim`,
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
 * @typedef {'real' | 'sim'} WDAKind
 */

/**
 * @typedef {Object} DownloadOptions
 * @property {string} outdir
 * @property {string} platform
 * @property {WDAKind | undefined} [kind]
 */
