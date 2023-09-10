import {exec, SubProcess} from 'teen_process';
import {fs, util, tempDir} from 'appium/support';
import log from './logger';
import path from 'path';

// https://github.com/YueChen-C/py-ios-device

const BINARY_NAME = 'pyidevice';

class Pyidevice {
  /**
   * @param {string} udid
   */
  constructor(udid) {
    this.udid = udid;
    this.binaryPath = null;
  }

  /**
   * @param {boolean} isStrict
   * @return {Promise<boolean>}
   */
  async assertExists(isStrict = true) {
    if (this.binaryPath) {
      return true;
    }

    try {
      this.binaryPath = await fs.which(BINARY_NAME);
      return true;
    } catch (e) {
      if (isStrict) {
        throw new Error(
          `${BINARY_NAME} binary cannot be found in PATH. ` +
            `Please make sure it is installed. Visit https://github.com/YueChen-C/py-ios-device for ` +
            `more details.`,
        );
      }
      return false;
    }
  }

  /**
   * @typedef {Object} ExecuteOptions
   * @property {string} cwd
   * @property {string?} format [json]
   * @property {boolean} logStdout [false]
   * @property {boolean} asynchronous [false]
   */

  /**
   * @param {string[]} args
   * @param {Partial<ExecuteOptions>} opts
   * @return {Promise<import('teen_process').TeenProcessExecResult|import('teen_process').SubProcess>}
   */
  async execute(args, opts = {}) {
    await this.assertExists();
    const {cwd, format = 'json', logStdout = false, asynchronous = false} = opts;

    const finalArgs = [...args, '--udid', this.udid, '--network'];
    if (format) {
      finalArgs.push('--format', format);
    }
    const binaryPath = /** @type {string} */ (this.binaryPath);
    const cmdStr = util.quote([binaryPath, ...finalArgs]);
    log.debug(`Executing ${cmdStr}`);
    try {
      if (asynchronous) {
        const result = new SubProcess(binaryPath, finalArgs, {cwd});
        await result.start(0);
        return result;
      }
      const result = await exec(binaryPath, finalArgs, {cwd});
      if (logStdout) {
        log.debug(`Command output: ${result.stdout}`);
      }
      return result;
    } catch (e) {
      throw new Error(`'${cmdStr}' failed. Original error: ${e.stderr || e.stdout || e.message}`);
    }
  }

  /**
   * @return {Promise<object>}
   */
  async listProfiles() {
    const {stdout} = /** @type {import('teen_process').TeenProcessExecResult} */ (
      await this.execute(['profiles', 'list'])
    );
    return JSON.parse(stdout);
  }

  /**
   *
   * @param { {profilePath?: string, payload: string|Buffer} } opts
   * @privateRemarks The error below seems to suggest that `payload` can be undefined, but the code suggests otherwise
   */
  async installProfile(opts) {
    const {profilePath, payload} = opts ?? {};
    if (!profilePath && !payload) {
      throw new Error('Either the full path to the profile or its payload must be provided');
    }

    let tmpRoot;
    let srcPath = profilePath;
    try {
      if (!srcPath) {
        tmpRoot = await tempDir.openDir();
        srcPath = path.join(tmpRoot, 'cert.pem');
        await fs.writeFile(srcPath, payload, 'utf8');
      }
      await this.execute(['profiles', 'install', '--path', srcPath], {
        logStdout: true,
      });
    } finally {
      if (tmpRoot) {
        await fs.rimraf(tmpRoot);
      }
    }
  }

  /**
   *
   * @param {string} name
   * @returns {Promise<string>}
   */
  async removeProfile(name) {
    return /** @type {import('teen_process').TeenProcessExecResult} */ (
      await this.execute(['profiles', 'remove', '--name', name], {logStdout: true})
    ).stdout;
  }

  /**
   * @returns {Promise<object>}
   */
  async listCrashes() {
    const {stdout} = /** @type {import('teen_process').TeenProcessExecResult} */ (
      await this.execute(['crash', 'list'])
    );
    return JSON.parse(stdout.replace(/'/g, '"')).filter((x) => !['.', '..'].includes(x));
  }

  /**
   * @param {string} name
   * @param {string} dstFolder
   * @returns {Promise<void>}
   */
  async exportCrash(name, dstFolder) {
    await this.execute(['crash', 'export', '--name', name], {
      logStdout: true,
      // The tool exports crash reports to the current working dir
      cwd: dstFolder,
    });
  }
  /**
   * @param {string} dstFile
   */
  async collectPcap(dstFile) {
    return await this.execute(['pcapd', dstFile], {
      format: null,
      asynchronous: true,
    });
  }
}

export {Pyidevice};
export default Pyidevice;
