/* eslint-disable require-await */
import {resolveExecutablePath} from './utils';
import {fs, doctor} from '@appium/support';
import {exec} from 'teen_process';
import { getPath as getXcodePath } from 'appium-xcode';
import '@colors/colors';


/** @satisfies {import('@appium/types').IDoctorCheck} */
export class XcodeCheck {
  async diagnose() {
    try {
      const xcodePath = await getXcodePath();
      return doctor.ok(`xCode is installed at '${xcodePath}'`);
    } catch (err) {
      return doctor.nok(err.message);
    }
  }

  async fix() {
    return `Manually install ${'Xcode'.bold} and configure the active developer directory path using the xcode-select tool`;
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return false;
  }
}
export const xcodeCheck = new XcodeCheck();


/** @satisfies {import('@appium/types').IDoctorCheck} */
export class XcodeToolsCheck {
  async diagnose() {
    try {
      // https://github.com/appium/appium/issues/12093#issuecomment-459358120
      await exec('xcrun', ['simctl', 'help']);
    } catch (err) {
      return doctor.nok(`Cannot run 'xcrun simctl': ${err.stderr || err.message}`);
    }
    try {
      await exec('xcodebuild', ['-version']);
    } catch (err) {
      return doctor.nok(`Cannot run 'xcodebuild': ${err.stderr || err.message}`);
    }
    return doctor.ok(`xCode tools are installed and work properly`);
  }

  async fix() {
    return `Fix the problems xCode tools are compliaining about`;
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return false;
  }
}
export const xcodeToolsCheck = new XcodeToolsCheck();


/**
 * @typedef EnvVarCheckOptions
 * @property {boolean} [expectDir] If set to true then
 * the path is expected to be a valid folder
 * @property {boolean} [expectFile] If set to true then
 * the path is expected to be a valid file
 */

/** @satisfies {import('@appium/types').IDoctorCheck} */
class EnvVarAndPathCheck {
  ENVIRONMENT_VARS_TUTORIAL_URL = 'https://github.com/appium/java-client/blob/master/docs/environment.md';

  /**
   * @param {string} varName
   * @param {EnvVarCheckOptions} [opts={}]
   */
  constructor(varName, opts = {}) {
    this.varName = varName;
    this.opts = opts;
  }

  async diagnose() {
    const varValue = process.env[this.varName];
    if (!varValue) {
      return doctor.nok(`${this.varName} environment variable is NOT set!`);
    }

    if (!await fs.exists(varValue)) {
      let errMsg = `${this.varName} is set to '${varValue}' but this path does not exist!`;
      return doctor.nok(errMsg);
    }

    const stat = await fs.stat(varValue);
    if (this.opts.expectDir && !stat.isDirectory()) {
      return doctor.nok(`${this.varName} is expected to be a valid folder, got a file path instead`);
    }
    if (this.opts.expectFile && stat.isDirectory()) {
      return doctor.nok(`${this.varName} is expected to be a valid file, got a folder path instead`);
    }

    return doctor.ok(`${this.varName} is set to: ${varValue}`);
  }

  async fix() {
    return (
      `Make sure the environment variable ${this.varName.bold} is properly configured for the Appium process. ` +
      `Refer ${this.ENVIRONMENT_VARS_TUTORIAL_URL} for more details.`
    );
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return false;
  }
}
export const homeEnvVarCheck = new EnvVarAndPathCheck('HOME', {expectDir: true});


/** @satisfies {import('@appium/types').IDoctorCheck} */
export class OptionalIdbCommandCheck {
  IDB_README_URL = 'https://git.io/JnxQc';

  async diagnose() {
    const fbIdbPath = await resolveExecutablePath('idb');
    const fbCompanionIdbPath = await resolveExecutablePath('idb_companion');
    if (fbIdbPath && fbCompanionIdbPath) {
      return doctor.okOptional('idb and idb_companion are installed');
    }

    if (!fbIdbPath && fbCompanionIdbPath) {
      return doctor.nokOptional('idb is not installed');
    } else if (fbIdbPath && !fbCompanionIdbPath) {
      return doctor.nokOptional('idb_companion is not installed');
    }
    return doctor.nokOptional('idb and idb_companion are not installed');
  }

  async fix() {
    return `Why ${'idb'.bold} is needed and how to install it: ${this.IDB_README_URL}`;
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return true;
  }
}
export const optionalIdbCheck = new OptionalIdbCommandCheck();


/** @satisfies {import('@appium/types').IDoctorCheck} */
export class OptionalApplesimutilsCommandCheck {
  README_LINK = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/execute-methods.md#mobile-setpermission';

  async diagnose() {
    const applesimutilsPath = await resolveExecutablePath('applesimutils');
    return applesimutilsPath
      ? doctor.okOptional(`applesimutils is installed at: ${applesimutilsPath}`)
      : doctor.nokOptional('applesimutils are not installed');
  }

  async fix() {
    return `Why ${'applesimutils'.bold} is needed and how to install it: ${this.README_LINK}`;
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return true;
  }
}
export const optionalApplesimutilsCheck = new OptionalApplesimutilsCommandCheck();


/** @satisfies {import('@appium/types').IDoctorCheck} */
export class OptionalFfmpegCheck {
  FFMPEG_BINARY = 'ffmpeg';
  FFMPEG_INSTALL_LINK = 'https://www.ffmpeg.org/download.html';

  async diagnose() {
    const ffmpegPath = await resolveExecutablePath(this.FFMPEG_BINARY);

    return ffmpegPath
      ? doctor.okOptional(`${this.FFMPEG_BINARY} exists at '${ffmpegPath}'`)
      : doctor.nokOptional(`${this.FFMPEG_BINARY} cannot be found`);
  }

  async fix() {
    return (
      `${`${this.FFMPEG_BINARY}`.bold} is used to capture screen recordings from the device under test. ` +
      `Please read ${this.FFMPEG_INSTALL_LINK}.`
    );
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return true;
  }
}
export const optionalFfmpegCheck = new OptionalFfmpegCheck();
