import {fs, logger} from 'appium/support.js';
import {exec} from 'teen_process';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp, rm} from 'node:fs/promises';
import {Command} from 'commander';

const SCRIPT_NAME = 'sign-wda';
const RESIGNER_BINARY_NAME = 'resigner';
const MOBILEPROVISION_EXTENSION = '.mobileprovision';
const DEFAULT_PROFILE_DIR_CANDIDATES = [
  path.join(os.homedir(), 'Library', 'Developer', 'Xcode', 'UserData', 'Provisioning Profiles'),
  path.join(os.homedir(), 'Library', 'MobileDevice', 'Provisioning Profiles'),
];
const DEFAULT_WDA_BUNDLE_IDS = [
  'com.facebook.WebDriverAgentRunner',
  'com.facebook.WebDriverAgentRunner.xctrunner',
  'com.facebook.WebDriverAgentLib',
];

const log = logger.getLogger(SCRIPT_NAME);

class RunCmd {
  /**
   * Check if the resginer binary is available in the PATH.
   * @returns {Promise<void>} Whether the resigner binary is available in the local environment
  */
  async requireResignerBinary() {
    try {
      await fs.which(RESIGNER_BINARY_NAME);
    } catch {
      throw new Error('Resigner binary is not available in the PATH.');
    }
  }
}


class RunInspectWDA extends RunCmd {
  /**
   * Run resigner inspect on the signed WDA and return the output.
   * @param {InspectWDAOptions} options
   * @returns {Promise<void>}
   */
  async inspect(options) {
    if (!(await fs.exists(options.wdaPath))) {
      throw new Error(`WDA path does not exist: ${options.wdaPath}`);
    }
    await this.requireResignerBinary();
    const inspectResult = await inspectWDAWithResigner(options.wdaPath);
    if (inspectResult) {
      log.info(`Resigner inspect result:\n---\n${inspectResult}`);
    } else {
      log.info('Resigner inspect finished, but no output was returned.');
    }
  }
}

class RunSignWDA extends RunCmd {
  /**
   * Run resigner to sign the WDA.
   * @param {SignWDAOptions} options
   * @returns {Promise<void>}
   */
  async sign(options) {
    if (!(await fs.exists(options.wdaPath))) {
      throw new Error(`WDA path does not exist: ${options.wdaPath}`);
    }
    await this.requireResignerBinary();
    const resolvedProfileDir = await resolveProfileDir(options.profileDir);

    let p12File = options.p12File;
    let tempDir;
    let p12Password = options.p12Password;

    try {
      // If cert and key provided, convert to p12 with auto-generated password
      if (options.p12Cert && options.p12Key) {
        const generatedPassword = generateRandomPassword();
        const result = await convertCertAndKeyToP12(options.p12Cert, options.p12Key, generatedPassword);
        p12File = result.p12File;
        tempDir = result.tempDir;
        p12Password = generatedPassword;
      }

      if (!p12File) {
        throw new Error('No p12 file available for signing');
      }

      await signWDAWithResigner(options.wdaPath, {
        p12File,
        p12Password,
        profileDir: resolvedProfileDir,
        bundleId: options.bundleId,
      });
    } finally {
      // Clean up temp directory if it was created
      if (tempDir) {
        try {
          await rm(tempDir, {recursive: true, force: true});
          log.info(`Cleaned up temporary directory: ${tempDir}`);
        } catch (err) {
          log.warn(`Failed to clean up temporary directory ${tempDir}: ${err.message}`);
        }
      }
    }
  }
}

/**
 * Generate a random password for temporary .p12 files.
 * @returns {string} A random 12-character alphanumeric password
 */
function generateRandomPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

/**
 * Convert .cer and .key files to a .p12 file.
 * @param {string} certPath - Path to the .cer certificate file
 * @param {string} keyPath - Path to the .key private key file
 * @param {string} p12Password - Password to protect the .p12 file
 * @returns {Promise<{p12File: string, tempDir: string}>} Path to the generated .p12 and temp directory
 */
async function convertCertAndKeyToP12(certPath, keyPath, p12Password) {
  // Validate input files exist
  if (!(await fs.exists(certPath))) {
    throw new Error(`Certificate file does not exist: ${certPath}`);
  }
  if (!(await fs.exists(keyPath))) {
    throw new Error(`Private key file does not exist: ${keyPath}`);
  }

  try {
    await fs.which('openssl');
  } catch {
    throw new Error('OpenSSL binary is not available in the PATH. ' +
      'It is required to convert .cer and .key files to .p12 format.');
  }

  // Create temp directory
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wda-sign-'));

  try {
    const certPem = path.join(tempDir, 'certificate.pem');
    const p12File = path.join(tempDir, 'certificate.p12');

    // Convert .cer to .pem
    log.info(`Converting certificate from ${certPath} to PEM format`);
    await exec('openssl', [
      'x509',
      '-in', certPath,
      '-inform', 'DER',
      '-out', certPem,
    ]);

    // Convert to .p12
    log.info(`Creating .p12 file from certificate and key`);
    await exec('openssl', [
      'pkcs12',
      '-export',
      '-in', certPem,
      '-inkey', keyPath,
      '-out', p12File,
      '-passout', `pass:${p12Password}`,
    ]);

    log.info(`Successfully created temporary .p12 file: ${p12File}`);
    return {p12File, tempDir};
  } catch (err) {
    // Clean up temp dir on error
    try {
      await rm(tempDir, {recursive: true, force: true});
    } catch {}
    throw err;
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

  if (!entries.some((name) => name.toLowerCase().endsWith(MOBILEPROVISION_EXTENSION))) {
    throw new Error(
      `${source} provisioning profile directory does not contain any ${MOBILEPROVISION_EXTENSION} files: ${dir}`
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
    args.push(
      ...[
      // To re-apply the same mapping again for past failure cases for safe.
      options.bundleId,
      ...DEFAULT_WDA_BUNDLE_IDS,
    ].flatMap((bundleId) => [
        '--bundle-id-remap',
        `${bundleId}=${options.bundleId}`,
      ])
    );
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
    .option('--p12-file <path>', 'Path to the .p12 signing certificate file (requires P12_PASSWORD env var; mutually exclusive with --p12-cert/--p12-key)')
    .option('--p12-cert <path>', 'Path to the .cer certificate file from Apple Developer portal (auto-converted to .p12 with generated password; mutually exclusive with --p12-file; must use with --p12-key)')
    .option('--p12-key <path>', 'Path to the .key private key file from Apple Developer portal (auto-converted to .p12 with generated password; mutually exclusive with --p12-file; must use with --p12-cert)')
    .option('--profile-dir <path>', 'Directory containing provisioning profiles (auto-discovered if omitted)')
    .option('--bundle-id <id>', 'Target bundle ID for remapping (e.g., com.example.wda)')
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Sign downloaded WDA with .p12 certificate (requires P12_PASSWORD)
  P12_PASSWORD=mypassword appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \
    --p12-file ~/sign.p12

  # Sign WDA with .cer and .key files (auto-converted, no password needed!)
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \
    --p12-cert ~/certificate.cer \
    --p12-key ~/private.key

  # Sign WDA and remap bundle ID with .p12 certificate (requires P12_PASSWORD)
  P12_PASSWORD=mypassword appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \
    --p12-file ~/sign.p12 \
    --bundle-id com.example.wda

  # Sign WDA with specified provisioning profile directory (cert+key approach)
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app \
    --p12-cert ~/certificate.cer \
    --p12-key ~/private.key \
    --profile-dir /path/to/your/provisioning/profiles

  # Inspect a WDA app without signing
  appium driver run xcuitest sign-wda -- --wda-path ./wda-real/WebDriverAgentRunner-Runner.app --inspect`,
    )
    .action(async (options) => {
      if (options.inspect) {
        new RunInspectWDA().inspect({
          wdaPath: options.wdaPath,
        });
        return;
      }

      const p12Password = process.env.P12_PASSWORD;

      // Validate that either --p12-file OR (--p12-cert AND --p12-key) is provided
      const hasP12File = !!options.p12File;
      const hasCertAndKey = !!(options.p12Cert && options.p12Key);

      if (!hasP12File && !hasCertAndKey) {
        throw new Error(
          `Must provide either --p12-file or both --p12-cert and --p12-key for signing mode`
        );
      }

      if (hasP12File && hasCertAndKey) {
        throw new Error(
          `Cannot provide both --p12-file and --p12-cert/--p12-key; use one approach`
        );
      }

      if ((options.p12Cert && !options.p12Key) || (!options.p12Cert && options.p12Key)) {
        throw new Error(
          `Both --p12-cert and --p12-key must be provided together`
        );
      }

      // P12_PASSWORD is only required when using --p12-file
      if (hasP12File && !p12Password) {
        throw new Error(
          `Missing required option for signing mode: P12_PASSWORD env var (required when using --p12-file)`
        );
      }

      await new RunSignWDA().sign({
        wdaPath: options.wdaPath,
        p12File: options.p12File,
        p12Cert: options.p12Cert,
        p12Key: options.p12Key,
        p12Password: p12Password || '',
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
 * @property {string | undefined} [p12File]
 * @property {string | undefined} [p12Cert]
 * @property {string | undefined} [p12Key]
 * @property {string} p12Password
 * @property {string | undefined} [profileDir]
 * @property {string | undefined} [bundleId]
 */

/**
 * @typedef {Object} InspectWDAOptions
 * @property {string} wdaPath
 */
