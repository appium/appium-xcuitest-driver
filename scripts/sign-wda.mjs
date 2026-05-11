import {fs, logger} from 'appium/support.js';
import {exec} from 'teen_process';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Command} from 'commander';

const SCRIPT_NAME = 'sign-wda';
const RESIGNER_BINARY_NAME = 'resigner';
const log = logger.getLogger(SCRIPT_NAME);
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
  await requireResignerBinary();
  const inspectResult = await inspectWDAWithResigner(options.wdaPath);
  if (inspectResult) {
    log.info(`Resigner inspect result:\n---\n${inspectResult}`);
  } else {
    log.info('Resigner inspect finished, but no output was returned.');
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
  await requireResignerBinary();
  const resolvedProfileDir = await resolveProfileDir(options.profileDir);
  await signWDAWithResigner(options.wdaPath, {
    p12File: options.p12File,
    p12Password: options.p12Password,
    profileDir: resolvedProfileDir,
    bundleId: options.bundleId,
  });
}

/**
 * Check if the resginer binary is available in the PATH.
 * @returns {Promise<void>} Whether the resigner binary is available in the local environment
*/
async function requireResignerBinary() {
  try {
    await exec(RESIGNER_BINARY_NAME, ['--help']);
  } catch {
    throw new Error('Resigner binary is not available in the PATH.');
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
 * @param {string} wdaPath
 * @param {SignOptions} options
 * @returns {Promise<void>}
 */
async function signWDAWithResigner(wdaPath, options) {
  const args = [
    '--p12-file', options.p12File,
    '--profile', options.profileDir,
    '--force',
  ];

  if (options.bundleId) {
    // To re-apply the same mapping again for past failure cases for safe.
    args.push('--bundle-id-remap', `${options.bundleId}=${options.bundleId}`);
    args.push('--bundle-id-remap', `com.facebook.WebDriverAgentRunner=${options.bundleId}`);
    args.push('--bundle-id-remap', `com.facebook.WebDriverAgentRunner.xctrunner=${options.bundleId}`);
    args.push('--bundle-id-remap', `com.facebook.WebDriverAgentLib=${options.bundleId}`);
  }

  args.push(wdaPath);

  log.info(`Running resigner to sign ${wdaPath}`);
  await exec(RESIGNER_BINARY_NAME, args, {
    env: {
      ...process.env,
      P12_PASSWORD: options.p12Password,
    },
  });
  log.info('WDA signed successfully');
}

/**
 * Run resigner inspect on the signed WDA and return the output.
 * @param {string} wdaPath
 * @returns {Promise<string>}
 */
async function inspectWDAWithResigner(wdaPath) {
  log.info(`Inspecting signed WDA at ${wdaPath}`);
  const {stdout} = await exec(RESIGNER_BINARY_NAME, ['--inspect', wdaPath]);
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
