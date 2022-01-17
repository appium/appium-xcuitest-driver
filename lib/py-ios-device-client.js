import { exec } from 'teen_process';
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

  async execute (args, ensureFormat = true) {
    await this.assertExists();

    const finalArgs = ['--udid', this.udid, ...args];
    if (ensureFormat) {
      finalArgs.push('--format', 'json');
    }
    log.debug(`Executing ${util.quote(BINARY_NAME, finalArgs)}`);
    const result = await exec(BINARY_NAME, finalArgs);
    return result;
  }

  async listProfiles () {
    const {stdout} = await this.execute(['profiles', 'list']);
    return JSON.parse(stdout);
  }

  async installProfile (opts = {}) {
    const {
      profilePath,
      payload,
    } = opts;
    if (!profilePath && !payload) {
      throw new TypeError('Profile must be defined');
    }

    if (profilePath) {
      await this.execute(['profiles', 'install', '--path', profilePath]);
    } else {
      const tmpRoot = await tempDir.openDir();
      const tmpCertPath = path.join(tmpRoot, 'cert.pem');
      try {
        await fs.writeFile(tmpCertPath, payload, 'utf8');
        await this.installProfile(tmpCertPath);
      } finally {
        await fs.rimraf(tmpRoot);
      }
    }
  }

  async removeProfile (name) {
    await this.execute(['profiles', 'remove', name]);
  }
}

export { Pyidevice };
export default Pyidevice;