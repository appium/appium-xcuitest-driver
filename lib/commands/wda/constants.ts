import AsyncLock from 'async-lock';
import path from 'node:path';
import {WDA_RUNNER_APP} from 'appium-webdriveragent';

export const SHARED_RESOURCES_GUARD = new AsyncLock();

export const WDA_SIM_STARTUP_RETRIES = 2;
export const WDA_REAL_DEV_STARTUP_RETRIES = 1;
export const WDA_REAL_DEV_TUTORIAL_URL =
  'https://appium.github.io/appium-xcuitest-driver/latest/preparation/real-device-config/';
export const WDA_STARTUP_RETRY_INTERVAL = 10000;

export const CAP_NAMES_NO_XCODEBUILD_REQUIRED = ['webDriverAgentUrl', 'usePreinstalledWDA'];

/** Whether xcodebuild is required to start WebDriverAgent for the given session options. */
export function isXcodebuildNeeded(opts: Record<string, unknown>): boolean {
  return !CAP_NAMES_NO_XCODEBUILD_REQUIRED.some((capName) => Boolean(opts[capName]));
}

/** CFBundleName value for WebDriverAgent runner apps on the device. */
export const WDA_CF_BUNDLE_NAME = path.basename(WDA_RUNNER_APP, '.app');

export const XCUITEST_DRIVER_SYNC_NAME = 'XCUITestDriver';

export const CUSTOMIZE_RESULT_BUNDLE_PATH = 'customize_result_bundle_path';
