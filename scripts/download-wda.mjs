import {constants as fsConstants, promises as fsPromises} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {fs, logger, zip, net, node} from 'appium/support.js';
import {Command, InvalidArgumentError} from 'commander';
import semver from 'semver';

const log = logger.getLogger('download-wda');
const WDA_KIND_REAL = 'real';
const WDA_KIND_SIM = 'sim';
const WDA_MONOREPO_VERSION = '16.16.0';
const WDA_PACKAGE_NAME = 'appium-webdriveragent';

const wdaUrl = (/** @type {string} */ version, /** @type {string} */ zipFileName) => {
  // 16.16.0 is the first release published from the appium-ios monorepo.
  const release = semver.gte(version, WDA_MONOREPO_VERSION)
    ? `appium-ios/releases/download/appium-webdriveragent@${version}`
    : `WebDriverAgent/releases/download/v${version}`;
  return `https://github.com/appium/${release}/${zipFileName}`;
};

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
  const downloadedZipFile = path.join(destDir, zipFileName);
  try {
    await downloadWithFallback(wdaVersion, zipFileName, downloadedZipFile, options.fallbackQueueMaxLen ?? 0);

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
 * Download the archive for the given version. If `fallbackQueueMaxLen` is positive and it
 * is not published yet (404), retry with up to that many lower versions that still
 * satisfy the allowed range, newest first.
 * @param {string} version
 * @param {string} zipFileName
 * @param {string} dstPath
 * @param {number} fallbackQueueMaxLen
 * @returns {Promise<void>}
 */
async function downloadWithFallback(version, zipFileName, dstPath, fallbackQueueMaxLen) {
  /** @type {string[] | undefined} */
  let fallbackVersions;
  const queue = [version];
  for (let current = queue.shift(); current; current = queue.shift()) {
    const url = wdaUrl(current, zipFileName);
    try {
      log.info(`Downloading ${url}`);
      await net.downloadFile(url, dstPath);
      return;
    } catch (err) {
      if (fallbackQueueMaxLen <= 0 || !isNotFound(err)) {
        throw err;
      }
      fallbackVersions ??= await getLowerAllowedVersions(version, fallbackQueueMaxLen);
      if (current === version) {
        queue.push(...fallbackVersions);
      }
      if (!queue.length) {
        throw err;
      }
      log.warn(`${url} is not available. Trying ${queue[0]} instead`);
    }
  }
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isNotFound(err) {
  return /** @type {any} */ (err)?.cause?.response?.status === 404;
}

/**
 * Published WDA versions below the given one, which satisfy the range
 * from the driver's package.json. Sorted from the highest to the lowest.
 * @param {string} version
 * @param {number} maxLen
 * @returns {Promise<string[]>}
 */
async function getLowerAllowedVersions(version, maxLen) {
  const range = (await readDriverPackageJson()).dependencies?.[WDA_PACKAGE_NAME];
  if (!range) {
    return [];
  }
  const res = await fetch(`https://registry.npmjs.org/${WDA_PACKAGE_NAME}`, {
    headers: {Accept: 'application/vnd.npm.install-v1+json'},
  });
  if (!res.ok) {
    log.warn(`Cannot list published ${WDA_PACKAGE_NAME} versions: HTTP ${res.status}`);
    return [];
  }
  const {versions = {}} = /** @type {{versions?: Record<string, unknown>}} */ (await res.json());
  return Object.keys(versions)
    .filter((v) => semver.lt(v, version) && semver.satisfies(v, range))
    .sort(semver.rcompare)
    .slice(0, maxLen);
}

/** @type {Record<string, string>} */
const PLATFORM_SCHEME_SUFFIXES = {tvos: '_tvOS', watchos: '_watchOS'};

const destZip = (/** @type {string} */ platform, /** @type {WDAKind} */ kind) => {
  const scheme = `WebDriverAgentRunner${PLATFORM_SCHEME_SUFFIXES[String(platform).toLowerCase()] ?? ''}`;
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
 * Return the driver's package.json contents
 * @returns {Promise<Record<string, any>>}
 */
async function readDriverPackageJson() {
  return JSON.parse(await fs.readFile(path.join(getDriverRoot(), 'package.json'), 'utf8'));
}

/** @returns {string} */
function getDriverRoot() {
  const moduleRoot = node.getModuleRootSync('appium-xcuitest-driver', fileURLToPath(import.meta.url));
  if (!moduleRoot) {
    throw new Error('Cannot resolve module root for appium-xcuitest-driver');
  }
  return moduleRoot;
}

/**
 * Return installed appium-webdriveragent package version
 * @returns {Promise<string>}
 */
async function getWebdriveragentPkgVersion() {
  const pkgPath = path.join(getDriverRoot(), 'node_modules', WDA_PACKAGE_NAME, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  if (!pkg.version || typeof pkg.version !== 'string') {
    throw new Error(`Cannot find version in ${pkgPath}`);
  }
  return pkg.version;
}

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
    .description('Download a prebuilt WebDriverAgentRunner for iOS/tvOS/watchOS real devices or simulators')
    .requiredOption('--outdir <path>', 'Destination directory to download and unpack into')
    .requiredOption('--platform <platform>', 'Target platform (e.g. iOS, tvOS or watchOS)', (value) => value)
    .option(
      '--kind <kind>',
      `Target package type: ${WDA_KIND_REAL} (real devices) or ${WDA_KIND_SIM} (simulators). Default: ${WDA_KIND_REAL}`,
    )
    .option(
      '--fallback-queue-max-len <number>',
      'If the archive for the installed WDA version is not published yet, try up to this many lower versions allowed by package.json (newest first). Default: 0 (no fallback)',
      (value) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new InvalidArgumentError('Must be a non-negative integer');
        }
        return parsed;
      },
    )
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Download WDA for iOS real device (default)
  appium driver run xcuitest download-wda -- --outdir ./wda-real --platform iOS

  # Download WDA for tvOS simulator
  appium driver run xcuitest download-wda -- --outdir ./wda-sim-tvos --platform tvOS --kind sim

  # Download WDA for watchOS simulator (watchOS only supports the Simulator, not real devices)
  appium driver run xcuitest download-wda -- --outdir ./wda-sim-watchos --platform watchOS --kind sim`,
    )
    .action(async (options) => {
      await getWDAPrebuiltPackage({
        ...options,
        kind: options.kind ?? WDA_KIND_REAL,
      });
    });

  await program.parseAsync(process.argv);
}

const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
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
 * @property {number} [fallbackQueueMaxLen]
 */
