import {fs, logger, net, zip} from 'appium/support.js';
import {exec} from 'teen_process';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Command} from 'commander';

const log = logger.getLogger('sign-wda');
const RESIGNER_REPO = 'KazuCocoa/resigner';
const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_PROFILE_DIR_CANDIDATES = [
  path.join(os.homedir(), 'Library', 'Developer', 'Xcode', 'UserData', 'Provisioning Profiles'),
  path.join(os.homedir(), 'Library', 'MobileDevice', 'Provisioning Profiles'),
];

/**
 * @param {InspectWDAOptions} options
 * @return {Promise<void>}
 */
export async function inspectWDA(options) {
  if (!(await fs.exists(options.wdaPath))) {
    throw new Error(`WDA path does not exist: ${options.wdaPath}`);
  }

  const tempDir = path.join(os.tmpdir(), `inspect-wda-${Date.now()}`);
  await fs.mkdir(tempDir, {recursive: true});
  let downloadedResigner = false;

  try {
    const {resignerPath, downloaded} = await resolveResignerBinary(tempDir);
    downloadedResigner = downloaded;
    const inspectResult = await inspectWDAWithResigner(resignerPath, options.wdaPath);
    if (inspectResult) {
      log.info(`Resigner inspect result:\n${inspectResult}`);
    } else {
      log.info('Resigner inspect finished, but no output was returned.');
    }
  } finally {
    if (downloadedResigner && (await fs.exists(tempDir))) {
      await fs.rimraf(tempDir);
    }
  }
}

/**
 * @param {SignWDAOptions} options
 * @return {Promise<void>}
 */
export async function signWDA(options) {
  if (!(await fs.exists(options.wdaPath))) {
    throw new Error(`WDA path does not exist: ${options.wdaPath}`);
  }

  const tempDir = path.join(os.tmpdir(), `sign-wda-${Date.now()}`);
  const resolvedProfileDir = await resolveProfileDir(options.profileDir);
  await fs.mkdir(tempDir, {recursive: true});
  let downloadedResigner = false;

  try {
    const {resignerPath, downloaded} = await resolveResignerBinary(tempDir);
    downloadedResigner = downloaded;
    await signWDAWithResigner(resignerPath, options.wdaPath, {
      p12File: options.p12File,
      p12Password: options.p12Password,
      profileDir: resolvedProfileDir,
      bundleId: options.bundleId,
    });

    const inspectResult = await inspectWDAWithResigner(resignerPath, options.wdaPath);
    if (inspectResult) {
      log.info(`Resigner inspect result:\n${inspectResult}`);
    } else {
      log.info('Resigner inspect finished, but no output was returned.');
    }
  } finally {
    if (downloadedResigner && (await fs.exists(tempDir))) {
      await fs.rimraf(tempDir);
    }
  }
}

/**
 * Get the latest resigner release version
 * @returns {Promise<string>}
 */
async function getLatestResignerVersion() {
  const apiUrl = `https://api.github.com/repos/${RESIGNER_REPO}/releases/latest`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'sign-wda',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Failed to fetch latest resigner version: request timed out after ${FETCH_TIMEOUT_MS}ms`, {
        cause: err,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch latest resigner version: ${await response.text()}`);
  }
  const data = /** @type {{tag_name: string}} */ (await response.json());
  return data.tag_name;
}

/**
 * Get resigner archive filename based on platform and architecture
 * @returns {string}
 */
function getResignerArchiveName() {
  const arch = os.arch();
  const platform = process.platform;

  let archSuffix;
  if (arch === 'arm64') {
    archSuffix = 'arm64';
  } else if (arch === 'x64') {
    archSuffix = 'amd64';
  } else {
    throw new Error(`Unsupported architecture: ${arch}`);
  }

  if (platform === 'darwin') {
    return `darwin-${archSuffix}.tar.gz`;
  } else if (platform === 'linux') {
    return `linux-${archSuffix}.tar.gz`;
  } else if (platform === 'win32') {
    return `windows-${archSuffix}.zip`;
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Download and extract resigner tool
 * @param {string} destDir
 * @returns {Promise<string>} Path to resigner binary
 */
async function downloadResigner(destDir) {
  let archiveName;
  try {
    log.info('Downloading resigner...');
    archiveName = getResignerArchiveName();

    const version = await getLatestResignerVersion();
    const resignerUrl = `https://github.com/${RESIGNER_REPO}/releases/download/${version}/${archiveName}`;
    const resignerArchive = path.join(destDir, archiveName);

    await net.downloadFile(resignerUrl, resignerArchive);

    log.info(`Extracting resigner from ${resignerArchive}`);

    if (archiveName.endsWith('.zip')) {
      // Windows releases are zip files
      await zip.extractAllTo(resignerArchive, destDir);
    } else {
      // macOS and Linux releases are tar.gz
      await exec('tar', ['xzf', resignerArchive, '-C', destDir]);
    }

    const platform = process.platform;
    const arch = os.arch();
    const archDir = arch === 'arm64' ? 'arm64' : 'amd64';

    let resignerDir, binaryName;
    if (platform === 'darwin') {
      resignerDir = `darwin-${archDir}`;
      binaryName = 'resigner';
    } else if (platform === 'linux') {
      resignerDir = `linux-${archDir}`;
      binaryName = 'resigner';
    } else if (platform === 'win32') {
      resignerDir = `windows-${archDir}`;
      binaryName = 'resigner.exe';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const resignerPath = path.join(destDir, resignerDir, binaryName);
    if (!(await fs.exists(resignerPath))) {
      throw new Error(`Resigner binary not found at ${resignerPath}`);
    }

    if (platform !== 'win32') {
      await fs.chmod(resignerPath, 0o755);
    }

    log.info(`Resigner ready at ${resignerPath}`);
    return resignerPath;
  } finally {
    if (archiveName) {
      const resignerArchive = path.join(destDir, archiveName);
      if (await fs.exists(resignerArchive)) {
        await fs.unlink(resignerArchive);
      }
    }
  }
}

/**
 * Resolve resigner binary from PATH, or download it if unavailable.
 * @param {string} tempDir
 * @returns {Promise<{resignerPath: string, downloaded: boolean}>}
 */
async function resolveResignerBinary(tempDir) {
  try {
    await exec('resigner', ['--help']);
    log.info('Using resigner binary from PATH');
    return {
      resignerPath: 'resigner',
      downloaded: false,
    };
  } catch {
    const resignerPath = await downloadResigner(tempDir);
    return {
      resignerPath,
      downloaded: true,
    };
  }
}

/**
 * Validate a provisioning profile directory.
 * @param {string} dir
 * @param {string} source
 * @returns {Promise<string>}
 */
async function validateProfileDir(dir, source) {
  if (!(await fs.exists(dir))) {
    throw new Error(`${source} provisioning profile directory does not exist: ${dir}`);
  }

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    throw new Error(`${source} provisioning profile directory is not a readable directory: ${dir}`);
  }

  if (!entries.some((name) => name.toLowerCase().endsWith('.mobileprovision'))) {
    throw new Error(
      `${source} provisioning profile directory does not contain any .mobileprovision files: ${dir}`
    );
  }

  return dir;
}

/**
 * Resolve the provisioning profile directory.
 * If user provided --profile-dir, validate and use it.
 * Otherwise discover from known defaults in priority order.
 * @param {string | undefined} profileDir
 * @returns {Promise<string>}
 */
async function resolveProfileDir(profileDir) {
  if (profileDir) {
    return await validateProfileDir(profileDir, 'Provided');
  }

  for (const candidate of DEFAULT_PROFILE_DIR_CANDIDATES) {
    if (!(await fs.exists(candidate))) {
      continue;
    }
    try {
      await validateProfileDir(candidate, 'Discovered');
      log.info(`Using discovered provisioning profile directory: ${candidate}`);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    `No provisioning profile directory could be discovered. ` +
      `Please provide --profile-dir explicitly. Checked: ${DEFAULT_PROFILE_DIR_CANDIDATES.join(', ')}`
  );
}

/**
 * Run resigner to sign WDA
 * @param {string} resignerPath
 * @param {string} wdaPath
 * @param {SignOptions} options
 * @returns {Promise<void>}
 */
async function signWDAWithResigner(resignerPath, wdaPath, options) {
  const args = [
    '--p12-file', options.p12File,
    '--profile', options.profileDir,
    '--force',
  ];

  if (options.bundleId) {
    args.push('--bundle-id-remap', `com.facebook.WebDriverAgentRunner=${options.bundleId}`);
    args.push('--bundle-id-remap', `com.facebook.WebDriverAgentRunner.xctrunner=${options.bundleId}`);
    args.push('--bundle-id-remap', `com.facebook.WebDriverAgentLib=${options.bundleId}`);
  }

  args.push(wdaPath);

  log.info(`Running resigner to sign ${wdaPath}`);
  await exec(resignerPath, args, {
    env: {
      ...process.env,
      P12_PASSWORD: options.p12Password,
    },
  });
  log.info('WDA signed successfully');
}

/**
 * Run resigner inspect on the signed WDA and return the output.
 * @param {string} resignerPath
 * @param {string} wdaPath
 * @returns {Promise<string>}
 */
async function inspectWDAWithResigner(resignerPath, wdaPath) {
  log.info(`Inspecting signed WDA at ${wdaPath}`);
  const {stdout} = await exec(resignerPath, ['--inspect', wdaPath]);
  return String(stdout || '').trim();
}

async function main() {
  const program = new Command();

  program
    .name('appium driver run xcuitest sign-wda')
    .description('Sign a WebDriverAgentRunner app bundle with code signing certificate')
    .requiredOption('--wda-path <path>', 'Path to the WebDriverAgentRunner.app bundle to sign')
    .option('--inspect', 'Run resigner inspect only (no signing)')
    .option('--p12-file <path>', 'Path to the .p12 signing certificate file')
    .option('--p12-password <password>', 'Password for the .p12 certificate (or use P12_PASSWORD env var)')
    .option('--profile-dir <path>', 'Directory containing provisioning profiles (auto-discovered if omitted)')
    .option('--bundle-id <id>', 'Target bundle ID for remapping (e.g., com.example.wda)')
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Sign downloaded WDA with certificate and provisioning profile
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \\
    --p12-file ~/sign.p12 --p12-password mypassword

  # Sign WDA and remap bundle ID
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \\
    --p12-file ~/sign.p12 --p12-password mypassword \\
    --bundle-id com.example.wda

  # Sign WDA and remap bundle ID with a specified provisioning profile directory
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \\
    --p12-file ~/sign.p12 --p12-password mypassword \\
    --profile-dir /path/to/your/provisioning/profiles \\
    --bundle-id com.example.wda

  # Inspect a WDA app without signing
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app --inspect`,
    )
    .action(async (options) => {
      if (options.inspect) {
        await inspectWDA({
          wdaPath: options.wdaPath,
        });
        return;
      }

      const p12Password = options.p12Password ?? process.env.P12_PASSWORD;

      const missingSigningOptions = [
        !options.p12File ? '--p12-file' : null,
        !p12Password ? '--p12-password (or P12_PASSWORD env var)' : null,
      ].filter(Boolean);
      if (missingSigningOptions.length) {
        throw new Error(
          `Missing required options for signing mode: ${missingSigningOptions.join(', ')}`
        );
      }

      await signWDA({
        wdaPath: options.wdaPath,
        p12File: options.p12File,
        p12Password,
        profileDir: options.profileDir,
        bundleId: options.bundleId,
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
 * @typedef {Object} SignOptions
 * @property {string} p12File
 * @property {string} p12Password
 * @property {string} profileDir
 * @property {string | undefined} [bundleId]
 */

/**
 * @typedef {Object} SignWDAOptions
 * @property {string} wdaPath
 * @property {string} p12File
 * @property {string} p12Password
 * @property {string | undefined} [profileDir]
 * @property {string | undefined} [bundleId]
 */

/**
 * @typedef {Object} InspectWDAOptions
 * @property {string} wdaPath
 */
