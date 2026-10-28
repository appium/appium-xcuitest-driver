import type {IDoctorCheck, AppiumLogger, DoctorCheckResult} from '@appium/types';
import {getPath as getXcodePath} from 'appium-xcode';
import {console as consoleUtils, fs, doctor} from 'appium/support.js';
import {exec} from 'teen_process';

import {REMOTE_XPC_PACKAGE_NAME, getXcuitestDriverRoot, isRemoteXpcDependencyAvailable} from './utils.js';

export class XcodeCheck implements IDoctorCheck {
  log!: AppiumLogger;

  async diagnose(): Promise<DoctorCheckResult> {
    try {
      const xcodePath = await getXcodePath();
      return doctor.ok(`Xcode is installed at '${xcodePath}'`);
    } catch (err) {
      return doctor.nok((err as Error).message);
    }
  }

  async fix(): Promise<string> {
    return `Install Xcode and make sure it is properly configured`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return false;
  }
}
export const xcodeCheck = new XcodeCheck();

export class XcodeToolsCheck implements IDoctorCheck {
  log!: AppiumLogger;

  async diagnose(): Promise<DoctorCheckResult> {
    const errPrefix = 'Xcode Command Line Tools are not installed or are improperly configured';
    try {
      await exec('xcodebuild', ['-version']);
    } catch (err) {
      return doctor.nok(`${errPrefix}. Cannot run 'xcodebuild': ${(err as any).stderr || (err as Error).message}`);
    }
    return doctor.ok(`Xcode Command Line Tools are installed and work properly`);
  }

  async fix(): Promise<string> {
    return `Make sure to install Xcode Command Line Tools by running 'xcode-select --install'`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return false;
  }
}
export const xcodeToolsCheck = new XcodeToolsCheck();

class EnvVarAndPathCheck implements IDoctorCheck {
  static readonly ENVIRONMENT_VARS_TUTORIAL_URL =
    'https://github.com/appium/java-client/blob/master/docs/environment.md';
  log!: AppiumLogger;

  constructor(
    private readonly varName: string,
    private readonly opts: EnvVarCheckOptions = {},
  ) {}

  async diagnose(): Promise<DoctorCheckResult> {
    const varValue = process.env[this.varName];
    if (!varValue) {
      return doctor.nok(`${this.varName} environment variable is NOT set!`);
    }

    if (!(await fs.exists(varValue))) {
      const errMsg = `${this.varName} is set to '${varValue}' but this path does not exist!`;
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

  async fix(): Promise<string> {
    return (
      `Make sure the environment variable ${consoleUtils.styleText('bold', this.varName)} is properly configured for the Appium process. ` +
      `Refer ${EnvVarAndPathCheck.ENVIRONMENT_VARS_TUTORIAL_URL} for more details.`
    );
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return false;
  }
}
export const homeEnvVarCheck = new EnvVarAndPathCheck('HOME', {expectDir: true});

export interface EnvVarCheckOptions {
  /**
   * If set to true then the path is expected to be a valid folder
   */
  expectDir?: boolean;
  /**
   * If set to true then the path is expected to be a valid file
   */
  expectFile?: boolean;
}

export class IosRemoteXpcDependencyCheck implements IDoctorCheck {
  static readonly README_LINK = 'https://github.com/appium/appium-ios/tree/main/packages/remotexpc';
  log!: AppiumLogger;

  async diagnose(): Promise<DoctorCheckResult> {
    if (await isRemoteXpcDependencyAvailable()) {
      return doctor.ok(
        `${REMOTE_XPC_PACKAGE_NAME} is installed and can be imported. ` +
          `It is used for all communication with real devices.`,
      );
    }
    return doctor.nok(
      `${REMOTE_XPC_PACKAGE_NAME} is not installed or cannot be imported. ` +
        `It is required for all communication with real devices.`,
    );
  }

  async fix(): Promise<string> {
    const driverRoot = getXcuitestDriverRoot();
    const locationHint = driverRoot ? `cd "${driverRoot}"; ` : '';
    return (
      `${consoleUtils.styleText('bold', REMOTE_XPC_PACKAGE_NAME)} provides the communication with real devices ` +
      `(over a Remote XPC tunnel or, as a temporary fallback, usbmux). ` +
      `Run '${locationHint}npm install ${REMOTE_XPC_PACKAGE_NAME}'. ` +
      `For more information, see ${IosRemoteXpcDependencyCheck.README_LINK}.`
    );
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return false;
  }
}
export const iosRemoteXpcDependencyCheck = new IosRemoteXpcDependencyCheck();
