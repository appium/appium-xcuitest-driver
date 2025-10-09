import {resolveExecutablePath} from './utils';
import {doctor} from 'appium/support';
import '@colors/colors';
import {exec} from 'teen_process';

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
export class OptionalSimulatorCheck {
  SUPPORTED_SIMULATOR_PLATFORMS = [
    {
      displayName: 'iOS',
      name: 'iphonesimulator'
    },
    {
      displayName: 'tvOS',
      name: 'appletvsimulator'
    }
  ];

  async diagnose() {
    try {
      // https://github.com/appium/appium/issues/12093#issuecomment-459358120
      await exec('xcrun', ['simctl', 'help']);
    } catch (err) {
      return doctor.nokOptional(
        `Testing on Simulator is not possible. Cannot run 'xcrun simctl': ${err.stderr || err.message}`
      );
    }

    const sdks = await this._listInstalledSdks();
    for (const {displayName, name} of this.SUPPORTED_SIMULATOR_PLATFORMS) {
      const errorPrefix = `Testing on ${displayName} Simulator is not possible`;
      const hasSdk = sdks.some(({platform}) => platform === name);
      if (!hasSdk) {
        return doctor.nokOptional(`${errorPrefix}: SDK is not installed`);
      }
    }

    return doctor.okOptional(
      `The following Simulator SDKs are installed:\n` +
      sdks
        .filter(({platform}) => this.SUPPORTED_SIMULATOR_PLATFORMS.some(({name}) => name === platform))
        .map(({displayName}) => `\t- ${displayName}`).join('\n')
    );
  }

  async fix() {
    return `Install the desired Simulator SDK from Xcode's Settings -> Components`;
  }

  hasAutofix() {
    return false;
  }

  isOptional() {
    return true;
  }

  async _listInstalledSdks() {
    const {stdout} = await exec('xcodebuild', ['-json', '-showsdks']);
    return JSON.parse(stdout);
    // Example output:
    /*
    [
      ...,
      {
        "buildID" : "E4E7682E-88C7-11F0-B669-CF409DDBA9DD",
        "canonicalName" : "iphoneos26.0",
        "displayName" : "iOS 26.0",
        "isBaseSdk" : true,
        "platform" : "iphoneos",
        "platformPath" : "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform",
        "platformVersion" : "26.0",
        "productBuildVersion" : "23A337",
        "productCopyright" : "1983-2025 Apple Inc.",
        "productName" : "iPhone OS",
        "productVersion" : "26.0",
        "sdkPath" : "/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS26.0.sdk",
        "sdkVersion" : "26.0"
      },
      ...
    ]
    */
  }
}
export const optionalSimulatorCheck = new OptionalSimulatorCheck();

/** @satisfies {import('@appium/types').IDoctorCheck} */
export class OptionalApplesimutilsCommandCheck {
  README_LINK = 'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/execute-methods.md#mobile-setpermission';

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
