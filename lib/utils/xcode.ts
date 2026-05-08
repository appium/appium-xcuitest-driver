import * as xcode from 'appium-xcode';
import {log} from '../logger';
import type {XcodeVersion} from 'appium-xcode';

/** Returns installed Xcode version or throws a descriptive error. */
export async function getAndCheckXcodeVersion(): Promise<XcodeVersion> {
  try {
    return await xcode.getVersion(true);
  } catch (err: any) {
    throw log.errorWithException(`Could not determine Xcode version: ${err.message}`);
  }
}

/** Returns the maximum available iOS SDK version or throws a descriptive error. */
export async function getAndCheckIosSdkVersion(): Promise<string | null> {
  try {
    return await xcode.getMaxIOSSDK();
  } catch (err: any) {
    throw log.errorWithException(`Could not determine iOS SDK version: ${err.message}`);
  }
}
