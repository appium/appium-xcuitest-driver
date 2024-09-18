/* eslint-disable require-await */
import {resolveExecutablePath} from './utils';
import {doctor} from 'appium/support';
import '@colors/colors';

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
