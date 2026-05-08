import {fs, logger, net, zip} from 'appium/support.js';
import {exec} from 'teen_process';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Command} from 'commander';

const log = logger.getLogger('sign-wda');
const RESIGNER_REPO = 'KazuCocoa/resigner';

/**
 * Get the latest resigner release version
 * @returns {Promise<string>}
 */
async function getLatestResignerVersion() {
  const apiUrl = `https://api.github.com/repos/${RESIGNER_REPO}/releases/latest`;
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch latest resigner version: ${response.statusText}`);
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
  try {
    log.info('Downloading resigner...');
    const version = await getLatestResignerVersion();
    const archiveName = getResignerArchiveName();
    const resignerUrl = `https://github.com/${RESIGNER_REPO}/releases/download/${version}/${archiveName}`;
    const resignerArchive = path.join(destDir, archiveName);

    await net.downloadFile(resignerUrl, resignerArchive);

    log.info(`Extracting resigner from ${resignerArchive}`);

    // Extract based on archive type
    if (archiveName.endsWith('.zip')) {
      await zip.extractAllTo(resignerArchive, destDir);
    } else {
      await exec('tar', ['xzf', resignerArchive, '-C', destDir]);
    }

    log.info(`Extracting resigner from ${resignerArchive}`);

    // Extract based on archive type
    if (archiveName.endsWith('.zip')) {
      await zip.extractAllTo(resignerArchive, destDir);
    } else {
      await exec('tar', ['xzf', resignerArchive, '-C', destDir]);
    }

    // Determine binary path based on platform
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

    // Ensure the binary is executable on Unix-like systems
    if (platform !== 'win32') {
      await fs.chmod(resignerPath, 0o755);
    }

    log.info(`Resigner ready at ${resignerPath}`);
    return resignerPath;
  } finally {
    const archiveName = getResignerArchiveName();
    const resignerArchive = path.join(destDir, archiveName);
    if (await fs.exists(resignerArchive)) {
      await fs.unlink(resignerArchive);
    }
  }
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
    '--p12-password', options.p12Password,
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
  await exec(resignerPath, args);
  log.info('WDA signed successfully');
}

/**
 * @param {SignWDAOptions} options
 */
export async function signWDA(options) {
  if (!(await fs.exists(options.wdaPath))) {
    throw new Error(`WDA path does not exist: ${options.wdaPath}`);
  }

  const tempDir = path.join(os.tmpdir(), `sign-wda-${Date.now()}`);
  await fs.mkdir(tempDir, {recursive: true});

  try {
    const resignerPath = await downloadResigner(tempDir);
    await signWDAWithResigner(resignerPath, options.wdaPath, {
      p12File: options.p12File,
      p12Password: options.p12Password,
      profileDir: options.profileDir,
      bundleId: options.bundleId,
    });
  } finally {
    if (await fs.exists(tempDir)) {
      await fs.rimraf(tempDir);
    }
  }
}

async function main() {
  const program = new Command();

  program
    .name('appium driver run xcuitest sign-wda')
    .description('Sign a WebDriverAgentRunner app bundle with code signing certificate')
    .requiredOption('--wda-path <path>', 'Path to the WebDriverAgentRunner.app bundle to sign')
    .requiredOption('--p12-file <path>', 'Path to the .p12 signing certificate file')
    .requiredOption('--p12-password <password>', 'Password for the .p12 certificate')
    .requiredOption('--profile-dir <path>', 'Directory containing provisioning profiles')
    .option('--bundle-id <id>', 'Target bundle ID for remapping (e.g., com.example.wda)')
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Sign downloaded WDA with certificate and provisioning profile
  appium driver run xcuitest sign-wda --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \\
    --p12-file ~/sign.p12 --p12-password mypassword \\
    --profile-dir ~/Library/MobileDevice/Provisioning\\ Profiles

  # Sign WDA and remap bundle ID
  appium driver run xcuitest sign-wda --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \\
    --p12-file ~/sign.p12 --p12-password mypassword \\
    --profile-dir ~/Library/MobileDevice/Provisioning\\ Profiles \\
    --bundle-id com.example.wda`,
    )
    .action(async (options) => {
      await signWDA({
        wdaPath: options.wdaPath,
        p12File: options.p12File,
        p12Password: options.p12Password,
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
 * @property {string} profileDir
 * @property {string | undefined} [bundleId]
 */
