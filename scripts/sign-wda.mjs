import {fs, logger} from 'appium/support.js';
import {exec} from 'teen_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {mkdtemp, rm} from 'node:fs/promises';
import {Command} from 'commander';

const scriptFilePath = fileURLToPath(import.meta.url);
const SCRIPT_NAME = path.basename(scriptFilePath, path.extname(scriptFilePath));
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

class Resigner {
  /** @type {string} */
  _wdaPath;

  /**
   * @param {string} wdaPath Path to the WebDriverAgent `.app` bundle.
   */
  constructor(wdaPath) {
    this._wdaPath = wdaPath;
  }

  /**
   * @param {SignOptions} options
   * @returns {Promise<void>}
   */
  async signWDA(options) {
    await this._requireBinary();
    const args = this._buildSignArgs(options);
    log.info(`Running resigner to sign ${this._wdaPath}`);
    await exec(RESIGNER_BINARY_NAME, args, {
      env: {
        ...process.env,
        P12_PASSWORD: options.p12Password,
      },
    });
    log.info('WDA signed successfully');
  }

  /**
   * @returns {Promise<string>}
   */
  async inspectWDA() {
    await this._requireBinary();
    log.info(`Inspecting signed WDA at ${this._wdaPath}`);
    const {stdout} = await exec(RESIGNER_BINARY_NAME, ['--inspect', this._wdaPath]);
    return String(stdout || '').trim();
  }

  /**
   * @param {SignOptions} options
   * @returns {string[]}
   */
  _buildSignArgs(options) {
    const args = [
      '--p12-file', options.p12File,
      '--profile', options.profileDir,
      '--force',
    ];

    if (options.bundleId) {
      args.push(
        ...[
          // To re-apply the same mapping again for past failure cases for safety.
          options.bundleId,
          ...DEFAULT_WDA_BUNDLE_IDS,
        ].flatMap((bundleId) => [
          '--bundle-id-remap',
          `${bundleId}=${options.bundleId}`,
        ])
      );
    }

    args.push(this._wdaPath);
    return args;
  }

  /**
   * @returns {Promise<void>}
   */
  async _requireBinary() {
    try {
      await fs.which(RESIGNER_BINARY_NAME);
    } catch {
      throw new Error('Resigner binary is not available in the PATH.');
    }
  }
}

class ProvisioningProfilesHelper {
  /** @type {string | undefined} */
  _profileDir;

  /**
   * @param {string | undefined} profileDir Explicit directory, or `undefined` to auto-discover.
   */
  constructor(profileDir) {
    this._profileDir = profileDir;
  }

  /**
   * @returns {Promise<string>}
   */
  async resolveRoot() {
    const profileDir = this._profileDir;
    if (profileDir) {
      return await this._validate(profileDir, 'Provided');
    }

    for (const candidate of DEFAULT_PROFILE_DIR_CANDIDATES) {
      if (!(await fs.exists(candidate))) {
        continue;
      }
      try {
        await this._validate(candidate, 'Discovered');
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
   * @param {string} dir
   * @param {string} source
   * @returns {Promise<string>}
   */
  async _validate(dir, source) {
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
}

class P12Converter {
  /** @type {string} */
  _certPath;
  /** @type {string} */
  _keyPath;
  /** @type {string} */
  _p12Password;

  /**
   * @param {string} certPath
   * @param {string} keyPath
   * @param {string} p12Password
   */
  constructor(certPath, keyPath, p12Password) {
    this._certPath = certPath;
    this._keyPath = keyPath;
    this._p12Password = p12Password;
  }

  /**
   * @returns {string}
   */
  static generateRandomPassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  }

  /**
   * @returns {Promise<{p12File: string, tempDir: string}>}
   */
  async convert() {
    await this._assertCertAndKeyExist();
    await this._requireOpenSsl();

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wda-sign-'));
    const certPemPath = path.join(tempDir, 'certificate.pem');
    const p12FilePath = path.join(tempDir, 'certificate.p12');

    try {
      await this._convertCerToPem(certPemPath);
      await this._exportPkcs12(certPemPath, p12FilePath);
      log.info(`Successfully created temporary .p12 file: ${p12FilePath}`);
      return {p12File: p12FilePath, tempDir};
    } catch (err) {
      try {
        await rm(tempDir, {recursive: true, force: true});
      } catch {}
      throw err;
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _assertCertAndKeyExist() {
    const certPath = this._certPath;
    const keyPath = this._keyPath;
    if (!(await fs.exists(certPath))) {
      throw new Error(`Certificate file does not exist: ${certPath}`);
    }
    if (!(await fs.exists(keyPath))) {
      throw new Error(`Private key file does not exist: ${keyPath}`);
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async _requireOpenSsl() {
    try {
      await fs.which('openssl');
    } catch {
      throw new Error(
        'OpenSSL binary is not available in the PATH. ' +
          'It is required to convert .cer and .key files to .p12 format.'
      );
    }
  }

  /**
   * @param {string} certPemPath
   * @returns {Promise<void>}
   */
  async _convertCerToPem(certPemPath) {
    const certPath = this._certPath;
    log.info(`Converting certificate from ${certPath} to PEM format`);
    await exec('openssl', [
      'x509',
      '-in', certPath,
      '-inform', 'DER',
      '-out', certPemPath,
    ]);
  }

  /**
   * @param {string} certPemPath
   * @param {string} p12FilePath
   * @returns {Promise<void>}
   */
  async _exportPkcs12(certPemPath, p12FilePath) {
    const keyPath = this._keyPath;
    const p12Password = this._p12Password;
    log.info(`Creating .p12 file from certificate and key`);
    await exec('openssl', [
      'pkcs12',
      '-export',
      '-in', certPemPath,
      '-inkey', keyPath,
      '-out', p12FilePath,
      '-passout', `pass:${p12Password}`,
    ]);
  }
}

/**
 * Shared helpers for workflows that operate on a WDA `.app` bundle path.
 */
class WdaBundleWorkflow {
  /**
   * @param {string} wdaPath
   * @returns {Promise<void>}
   */
  async _assertWdaExists(wdaPath) {
    if (!(await fs.exists(wdaPath))) {
      throw new Error(`WDA path does not exist: ${wdaPath}`);
    }
  }
}

class SignWdaWorkflow extends WdaBundleWorkflow {
  /**
   * @param {object} [deps]
   * @param {(wdaPath: string) => Resigner} [deps.createResigner]
   * @param {(profileDir: string | undefined) => ProvisioningProfilesHelper} [deps.createProvisioning]
   * @param {(certPath: string, keyPath: string, p12Password: string) => P12Converter} [deps.createP12]
   */
  constructor(deps = {}) {
    super();
    this._createResigner = deps.createResigner ?? ((wdaPath) => new Resigner(wdaPath));
    this._createProvisioning =
      deps.createProvisioning ?? ((profileDir) => new ProvisioningProfilesHelper(profileDir));
    this._createP12 =
      deps.createP12 ?? ((certPath, keyPath, p12Password) => new P12Converter(certPath, keyPath, p12Password));
  }

  /**
   * @param {SignWDAOptions} options
   * @returns {Promise<void>}
   */
  async run(options) {
    await this._assertWdaExists(options.wdaPath);
    const resolvedProfileDir = await this._createProvisioning(options.profileDir).resolveRoot();

    let p12File = options.p12File;
    let tempDir;
    let p12Password = options.p12Password;

    try {
      if (options.p12Cert && options.p12Key) {
        const generatedPassword = P12Converter.generateRandomPassword();
        const result = await this._createP12(
          options.p12Cert,
          options.p12Key,
          generatedPassword
        ).convert();
        p12File = result.p12File;
        tempDir = result.tempDir;
        p12Password = generatedPassword;
      }

      if (!p12File) {
        throw new Error('No p12 file available for signing');
      }

      await this._createResigner(options.wdaPath).signWDA({
        p12File,
        p12Password,
        profileDir: resolvedProfileDir,
        bundleId: options.bundleId,
      });
    } finally {
      await this._cleanupTempDir(tempDir);
    }
  }

  /**
   * @param {string | undefined} tempDir
   * @returns {Promise<void>}
   */
  async _cleanupTempDir(tempDir) {
    if (!tempDir) {
      return;
    }
    try {
      await rm(tempDir, {recursive: true, force: true});
      log.info(`Cleaned up temporary directory: ${tempDir}`);
    } catch (err) {
      log.warn(`Failed to clean up temporary directory ${tempDir}: ${err.message}`);
    }
  }
}

class InspectWdaWorkflow extends WdaBundleWorkflow {
  /**
   * @param {object} [deps]
   * @param {(wdaPath: string) => Resigner} [deps.createResigner]
   */
  constructor(deps = {}) {
    super();
    this._createResigner = deps.createResigner ?? ((wdaPath) => new Resigner(wdaPath));
  }

  /**
   * @param {InspectWDAOptions} options
   * @returns {Promise<void>}
   */
  async run(options) {
    await this._assertWdaExists(options.wdaPath);
    const inspectResult = await this._createResigner(options.wdaPath).inspectWDA();
    if (inspectResult) {
      log.info(`Resigner inspect result:\n---\n${inspectResult}`);
    } else {
      log.info('Resigner inspect finished, but no output was returned.');
    }
  }
}

class SignWdaCli {
  /**
   * @param {object} [deps]
   * @param {SignWdaWorkflow} [deps.signWorkflow]
   * @param {InspectWdaWorkflow} [deps.inspectWorkflow]
   */
  constructor(deps = {}) {
    this._signWorkflow = deps.signWorkflow ?? new SignWdaWorkflow();
    this._inspectWorkflow = deps.inspectWorkflow ?? new InspectWdaWorkflow();
  }

  /**
   * @param {string[]} argv
   * @returns {Promise<void>}
   */
  async run(argv) {
    const program = this._createProgram();
    await program.parseAsync(argv);
  }

  /**
   * @returns {Command}
   */
  _createProgram() {
    const program = new Command();

    program
      .name('appium driver run xcuitest sign-wda')
      .description('Sign a WebDriverAgentRunner app bundle with code signing certificate')
      .requiredOption('--wda-path <path>', 'Path to the WebDriverAgentRunner.app bundle to sign')
      .option('--inspect', 'Run resigner inspect only (no signing)')
      .option(
        '--p12-file <path>',
        'Path to the .p12 signing certificate file (requires P12_PASSWORD env var; mutually exclusive with --p12-cert/--p12-key)'
      )
      .option(
        '--p12-cert <path>',
        'Path to the .cer certificate file from Apple Developer portal (auto-converted to .p12 with generated password; mutually exclusive with --p12-file; must use with --p12-key)'
      )
      .option(
        '--p12-key <path>',
        'Path to the .key private key file from Apple Developer portal (auto-converted to .p12 with generated password; mutually exclusive with --p12-file; must use with --p12-cert)'
      )
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
        await this._handleParsedOptions(options);
      });

    return program;
  }

  /**
   * @param {object} options
   * @returns {Promise<void>}
   */
  async _handleParsedOptions(options) {
    if (options.inspect) {
      await this._inspectWorkflow.run({
        wdaPath: options.wdaPath,
      });
      return;
    }

    const p12Password = process.env.P12_PASSWORD;
    this._checkSigningOptions(options, p12Password);

    await this._signWorkflow.run({
      wdaPath: options.wdaPath,
      p12File: options.p12File,
      p12Cert: options.p12Cert,
      p12Key: options.p12Key,
      p12Password: p12Password || '',
      profileDir: options.profileDir,
      bundleId: options.bundleId,
    });
  }

  /**
   * @param {object} options
   * @param {string | undefined} p12Password
   * @returns {void}
   */
  _checkSigningOptions(options, p12Password) {
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

    if (hasP12File && !p12Password) {
      throw new Error(
        `Missing required option for signing mode: P12_PASSWORD env var (required when using --p12-file)`
      );
    }
  }
}

const isMainModule =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await new SignWdaCli().run(process.argv);
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
