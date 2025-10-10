import {resolveExecutablePath} from './utils';
import {doctor} from 'appium/support';
import type {IDoctorCheck, AppiumLogger, DoctorCheckResult} from '@appium/types';
import '@colors/colors';
import {exec} from 'teen_process';

export class OptionalIdbCommandCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly IDB_README_URL = 'https://git.io/JnxQc';

  async diagnose(): Promise<DoctorCheckResult> {
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

  async fix(): Promise<string> {
    return `Why ${'idb'.bold} is needed and how to install it: ${OptionalIdbCommandCheck.IDB_README_URL}`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalIdbCheck = new OptionalIdbCommandCheck();

export class OptionalSimulatorCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly SUPPORTED_SIMULATOR_PLATFORMS: SimulatorPlatform[] = [
    {
      displayName: 'iOS',
      name: 'iphonesimulator'
    },
    {
      displayName: 'tvOS',
      name: 'appletvsimulator'
    }
  ];

  async diagnose(): Promise<DoctorCheckResult> {
    try {
      // https://github.com/appium/appium/issues/12093#issuecomment-459358120
      await exec('xcrun', ['simctl', 'help']);
    } catch (err) {
      return doctor.nokOptional(
        `Testing on Simulator is not possible. Cannot run 'xcrun simctl': ${(err as any).stderr || (err as Error).message}`
      );
    }

    const sdks = await this._listInstalledSdks();
    for (const {displayName, name} of OptionalSimulatorCheck.SUPPORTED_SIMULATOR_PLATFORMS) {
      const errorPrefix = `Testing on ${displayName} Simulator is not possible`;
      if (!sdks.some(({platform}) => platform === name)) {
        return doctor.nokOptional(`${errorPrefix}: SDK is not installed`);
      }
    }

    return doctor.okOptional(
      `The following Simulator SDKs are installed:\n` +
      sdks
        .filter(({platform}) => OptionalSimulatorCheck.SUPPORTED_SIMULATOR_PLATFORMS.some(({name}) => name === platform))
        .map(({displayName}) => `\t→ ${displayName}`).join('\n')
    );
  }

  async fix(): Promise<string> {
    return `Install the desired Simulator SDK from Xcode's Settings -> Components`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }

  private async _listInstalledSdks(): Promise<InstalledSdk[]> {
    const {stdout} = await exec('xcodebuild', ['-json', '-showsdks']);
    return JSON.parse(stdout);
  }
}
export const optionalSimulatorCheck = new OptionalSimulatorCheck();

export class OptionalApplesimutilsCommandCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly README_LINK = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/execute-methods.md#mobile-setpermission';

  async diagnose(): Promise<DoctorCheckResult> {
    const applesimutilsPath = await resolveExecutablePath('applesimutils');
    return applesimutilsPath
      ? doctor.okOptional(`applesimutils is installed at: ${applesimutilsPath}`)
      : doctor.nokOptional('applesimutils are not installed');
  }

  async fix(): Promise<string> {
    return `Why ${'applesimutils'.bold} is needed and how to install it: ${OptionalApplesimutilsCommandCheck.README_LINK}`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalApplesimutilsCheck = new OptionalApplesimutilsCommandCheck();


export class OptionalFfmpegCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly FFMPEG_BINARY = 'ffmpeg';
  static readonly FFMPEG_INSTALL_LINK = 'https://www.ffmpeg.org/download.html';

  async diagnose(): Promise<DoctorCheckResult> {
    const ffmpegPath = await resolveExecutablePath(OptionalFfmpegCheck.FFMPEG_BINARY);

    return ffmpegPath
      ? doctor.okOptional(`${OptionalFfmpegCheck.FFMPEG_BINARY} exists at '${ffmpegPath}'`)
      : doctor.nokOptional(`${OptionalFfmpegCheck.FFMPEG_BINARY} cannot be found`);
  }

  async fix(): Promise<string> {
    return (
      `${`${OptionalFfmpegCheck.FFMPEG_BINARY}`.bold} is used to capture screen recordings from the device under test. ` +
      `Please read ${OptionalFfmpegCheck.FFMPEG_INSTALL_LINK}.`
    );
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalFfmpegCheck = new OptionalFfmpegCheck();

interface SimulatorPlatform {
  displayName: string;
  name: string;
}

interface InstalledSdk {
  buildID?: string;
  canonicalName: string;
  displayName: string;
  isBaseSdk: boolean;
  platform: string;
  platformPath: string;
  platformVersion: string;
  productBuildVersion?: string;
  productCopyright?: string;
  productName?: string;
  productVersion?: string;
  sdkPath: string;
  sdkVersion: string;
}
