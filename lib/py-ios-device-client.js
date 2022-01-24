import { exec, SubProcess } from 'teen_process';
import { fs, util, tempDir } from 'appium-support';
import log from './logger';
import path from 'path';

// https://github.com/YueChen-C/py-ios-device

const BINARY_NAME = 'pyidevice';

class Pyidevice {
  constructor (udid) {
    this.udid = udid;
    this.binaryPath = null;
  }

  async assertExists (isStrict = true) {
    if (this.binaryPath) {
      return true;
    }

    try {
      this.binaryPath = await fs.which(BINARY_NAME);
      return true;
    } catch (e) {
      if (isStrict) {
        throw new Error(`${BINARY_NAME} binary cannot be found in PATH. ` +
          `Please make sure it is installed. Visit https://github.com/YueChen-C/py-ios-device for ` +
          `more details.`);
      }
      return false;
    }
  }

  async execute (args, opts = {}) {
    await this.assertExists();
    const {
      cwd,
      format = 'json',
      logStdout = false,
      asynchronous = false,
    } = opts;

    const finalArgs = [...args, '--udid', this.udid];
    if (format) {
      finalArgs.push('--format', format);
    }
    const cmdStr = util.quote([this.binaryPath, ...finalArgs]);
    log.debug(`Executing ${cmdStr}`);
    try {
      if (asynchronous) {
        const result = new SubProcess(this.binaryPath, finalArgs, {cwd});
        await result.start(0);
        return result;
      }
      const result = await exec(this.binaryPath, finalArgs, {cwd});
      if (logStdout) {
        log.debug(`Command output: ${result.stdout}`);
      }
      return result;
    } catch (e) {
      throw new Error(`'${cmdStr}' failed. Original error: ${e.stderr || e.stdout || e.message}`);
    }
  }

  async listProfiles () {
    const {stdout} = await this.execute(['profiles', 'list']);
    return JSON.parse(stdout);
  }

  async installProfile ({profilePath, payload} = {}) {
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
        logStdout: true
      });
    } finally {
      if (tmpRoot) {
        await fs.rimraf(tmpRoot);
      }
    }
  }

  async removeProfile (name) {
    await this.execute(['profiles', 'remove', name], {logStdout: true});
  }

  async listCrashes () {
    const {stdout} = await this.execute(['crash', 'list']);
    return JSON.parse(stdout.replace(/'/g, '"')).filter((x) => !['.', '..'].includes(x));
  }

  async exportCrash (name, dstFolder) {
    await this.execute(['crash', 'export', '--name', name], {
      logStdout: true,
      // The tool exports crash reports to the current working dir
      cwd: dstFolder
    });
  }

  async collectPcap (dstFile) {
    return await this.execute(['pcapd', dstFile], {
      format: null,
      asynchronous: true
    });
  }
}

export { Pyidevice };
export default Pyidevice;
