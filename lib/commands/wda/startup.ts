import {errors} from 'appium/driver';
import {fs, timing, util} from 'appium/support';
import type {StringRecord} from '@appium/types';
import {retryInterval} from 'asyncbox';
import _ from 'lodash';
import path from 'node:path';
import {installToRealDevice} from '../../device/real-device-management';
import {installToSimulator} from '../../device/simulator-management';
import type {XCUITestDriver} from '../../driver';
import {isLocalHost, isIos17OrNewerPlatform} from '../../utils';
import {markSystemFilesForCleanup} from './cleanup';
import {
  CAP_NAMES_NO_XCODEBUILD_REQUIRED,
  CUSTOMIZE_RESULT_BUNDLE_PATH,
  isXcodebuildNeeded,
  SHARED_RESOURCES_GUARD,
  WDA_CF_BUNDLE_NAME,
  WDA_REAL_DEV_STARTUP_RETRIES,
  WDA_REAL_DEV_TUTORIAL_URL,
  WDA_SIM_STARTUP_RETRIES,
  WDA_STARTUP_RETRY_INTERVAL,
  XCUITEST_DRIVER_SYNC_NAME,
} from './constants';

interface StartupRetryOptions {
  startupRetries: number;
  startupRetryInterval: number;
}

/**
 * Initializes the WebDriverAgent connection, prepares the device, and starts WDA.
 */
export async function start(this: XCUITestDriver): Promise<void> {
  await setupConnection(this);
  const synchronizationKey = await getSynchronizationKey(this);
  logSynchronizationDetails(this, synchronizationKey);
  assertUsePreinstalledWdaSupported(this);
  await assertPrebuiltPathExists(this);
  return await SHARED_RESOURCES_GUARD.acquire(synchronizationKey, async () => {
    await startUnderSynchronizationLock(this);
  });
}

/**
 * Creates a WebDriverAgent session with the given application bundle and process arguments.
 */
export async function startWdaSession(
  this: XCUITestDriver,
  bundleId?: string,
  processArguments?: any,
): Promise<void> {
  return createWdaSession(this, bundleId, processArguments);
}

/**
 * Prepares a preinstalled WebDriverAgent bundle on the device before launch.
 */
async function preparePreinstalled(driver: XCUITestDriver): Promise<void> {
  if (driver.isRealDevice()) {
    await driver.mobileKillApp(driver.wda.bundleIdForXctest);
  }

  if (!driver.opts.prebuiltWDAPath) {
    await cleanupApps(driver, [driver.wda.bundleIdForXctest]);
    return;
  }

  const candidateBundleId = await driver.appInfosCache.extractBundleId(driver.opts.prebuiltWDAPath);
  driver.wda.updatedWDABundleId = candidateBundleId.replace('.xctrunner', '');
  await cleanupApps(driver, [candidateBundleId, driver.wda.updatedWDABundleId]);
  driver.log.info(
    `Installing prebuilt WDA at '${driver.opts.prebuiltWDAPath}'. Bundle identifier: ${candidateBundleId}.`,
  );

  if (driver.isRealDevice()) {
    await installToRealDevice.bind(driver)(driver.opts.prebuiltWDAPath, candidateBundleId, {
      skipUninstall: true,
      timeout: driver.opts.appPushTimeout,
    });
  } else {
    await installToSimulator.bind(driver)(driver.opts.prebuiltWDAPath, candidateBundleId);
  }
}

/**
 * Removes WebDriverAgent runner apps that share the same CFBundleName except those listed in `keepBundleIds`.
 *
 * @param driver - The driver instance
 * @param keepBundleIds - Bundle identifiers to preserve on the device
 */
async function cleanupApps(driver: XCUITestDriver, keepBundleIds: string[] = []): Promise<void> {
  const installedBundleIds =
    await driver.device.getUserInstalledBundleIdsByBundleName(WDA_CF_BUNDLE_NAME);
  const keep = new Set(keepBundleIds.filter(Boolean));
  for (const bundleId of installedBundleIds.filter((id) => !keep.has(id))) {
    driver.log.info(
      `Removing WebDriverAgent runner app '${bundleId}' ` +
        `(CFBundleName '${WDA_CF_BUNDLE_NAME}')`,
    );
    try {
      await driver.device.removeApp(bundleId);
    } catch (e: any) {
      driver.log.warn(`Failed to remove WebDriverAgent apps: ${e.message}`);
    }
  }
}

async function setupConnection(driver: XCUITestDriver): Promise<void> {
  if (!util.hasValue(driver.wda.webDriverAgentUrl)) {
    await driver.wda.cleanupObsoleteProcesses();
  }

  const usePortForwarding =
    driver.isRealDevice() && !driver.wda.webDriverAgentUrl && isLocalHost(driver.wda.wdaBaseUrl);
  await driver.deviceConnectionsFactory.requestConnection(
    driver.opts.udid,
    Number(driver.wda.url.port),
    {
      devicePort: usePortForwarding ? driver.wda.wdaRemotePort : null,
      platformVersion: driver.opts.platformVersion,
      usePortForwarding,
    },
  );
}

async function getSynchronizationKey(driver: XCUITestDriver): Promise<string> {
  if (driver.opts.useXctestrunFile || !(await driver.wda.isSourceFresh())) {
    const derivedDataPath = await driver.wda.retrieveDerivedDataPath();
    if (derivedDataPath) {
      return path.normalize(derivedDataPath);
    }
  }
  return XCUITEST_DRIVER_SYNC_NAME;
}

function logSynchronizationDetails(driver: XCUITestDriver, synchronizationKey: string): void {
  driver.log.debug(
    `Starting WebDriverAgent initialization with the synchronization key '${synchronizationKey}'`,
  );
  if (
    SHARED_RESOURCES_GUARD.isBusy() &&
    !driver.opts.derivedDataPath &&
    !driver.opts.bootstrapPath
  ) {
    driver.log.debug(
      `Consider setting a unique 'derivedDataPath' capability value for each parallel driver instance ` +
        `to avoid conflicts and speed up the building process`,
    );
  }
}

function assertUsePreinstalledWdaSupported(driver: XCUITestDriver): void {
  if (!driver.opts.usePreinstalledWDA) {
    return;
  }

  const {platformVersion} = driver.opts;
  if (!isIos17OrNewerPlatform(platformVersion)) {
    throw new Error(
      `The 'usePreinstalledWDA' capability is only supported on iOS/tvOS 17.0 and newer ` +
        `(the current 'platformVersion' capability value is '${platformVersion}'). ` +
        `WebDriverAgent v13 no longer uses the legacy XCTest launch path that was required on iOS 16 and below. ` +
        `Use the default xcodebuild flow or provide 'webDriverAgentUrl' instead.`,
    );
  }
}

async function assertPrebuiltPathExists(driver: XCUITestDriver): Promise<void> {
  if (
    driver.opts.usePreinstalledWDA &&
    driver.opts.prebuiltWDAPath &&
    !(await fs.exists(driver.opts.prebuiltWDAPath))
  ) {
    throw new Error(
      `The prebuilt WebDriverAgent app at '${driver.opts.prebuiltWDAPath}' provided as 'prebuiltWDAPath' ` +
        `capability value does not exist or is not accessible`,
    );
  }
}

async function startUnderSynchronizationLock(driver: XCUITestDriver): Promise<void> {
  await prepareForXcodebuild(driver);

  if (driver.opts.resultBundlePath) {
    driver.assertFeatureEnabled(CUSTOMIZE_RESULT_BUNDLE_PATH);
  }

  const {startupRetries, startupRetryInterval} = getStartupRetryOptions(driver);
  await runStartupWithRetries(driver, startupRetries, startupRetryInterval);
}

async function prepareForXcodebuild(driver: XCUITestDriver): Promise<void> {
  if (!isXcodebuildNeeded(driver.opts)) {
    return;
  }

  if (driver.opts.useNewWDA) {
    driver.log.debug(
      `Capability 'useNewWDA' set to true, so quitting and uninstalling WDA before proceeding`,
    );
    await driver.wda.quit();
    await cleanupApps(driver);
    driver.logEvent('wdaUninstalled');
    return;
  }

  if (await driver.wda.setupCaching()) {
    return;
  }

  // Cleanup only WDA apps that are not the current one
  await cleanupApps(driver, [driver.wda.bundleIdForXctest]);
}

function getStartupRetryOptions(driver: XCUITestDriver): StartupRetryOptions {
  let startupRetries =
    driver.opts.wdaStartupRetries ||
    (driver.isRealDevice() ? WDA_REAL_DEV_STARTUP_RETRIES : WDA_SIM_STARTUP_RETRIES);
  const startupRetryInterval = driver.opts.wdaStartupRetryInterval || WDA_STARTUP_RETRY_INTERVAL;

  if (isXcodebuildNeeded(driver.opts)) {
    driver.log.debug(
      `Trying to start WebDriverAgent ${startupRetries} times with ${startupRetryInterval}ms interval`,
    );
    if (
      !util.hasValue(driver.opts.wdaStartupRetries) &&
      !util.hasValue(driver.opts.wdaStartupRetryInterval)
    ) {
      driver.log.debug(
        `These values can be customized by changing wdaStartupRetries/wdaStartupRetryInterval capabilities`,
      );
    }
  } else {
    driver.log.debug(
      `Trying to start WebDriverAgent once since at least one of ${CAP_NAMES_NO_XCODEBUILD_REQUIRED} capabilities is provided`,
    );
    startupRetries = 1;
  }

  return {startupRetries, startupRetryInterval};
}

async function runStartupWithRetries(
  driver: XCUITestDriver,
  startupRetries: number,
  startupRetryInterval: number,
): Promise<void> {
  let shortCircuitError: InstanceType<typeof errors.TimeoutError> | null = null;
  let retryCount = 0;

  await retryInterval(startupRetries, startupRetryInterval, async () => {
    driver.logEvent('wdaStartAttempted');
    if (retryCount > 0) {
      driver.log.info(`Retrying WDA startup (${retryCount + 1} of ${startupRetries})`);
    }

    try {
      await launchOnce(driver);
    } catch (err) {
      retryCount++;
      await handleLaunchFailure(driver, err);
    }

    shortCircuitError = await establishProxySession(driver);
    if (shortCircuitError) {
      return;
    }

    await finalizeSuccessfulStartup(driver);
  });

  if (shortCircuitError) {
    throw shortCircuitError;
  }
}

async function launchOnce(driver: XCUITestDriver): Promise<void> {
  if (driver.opts.usePreinstalledWDA) {
    await preparePreinstalled(driver);
  }

  if (!driver.sessionId) {
    throw new Error('Session ID is required but was not set');
  }
  driver.cachedWdaStatus = await driver.wda.launch(driver.sessionId);
}

async function handleLaunchFailure(driver: XCUITestDriver, err: unknown): Promise<void> {
  driver.logEvent('wdaStartFailed');
  const cause = err instanceof Error ? err : new Error(String(err));
  driver.log.debug(cause.stack);

  let errorMsg = `Unable to launch WebDriverAgent. Original error: ${cause.message}`;
  if (driver.isRealDevice()) {
    errorMsg += `. Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}`;
  }

  if (driver.opts.usePreinstalledWDA) {
    try {
      await driver.wda.quit();
    } catch {}
    errorMsg =
      `Unable to launch WebDriverAgent. Original error: ${cause.message}. ` +
      `Make sure the application ${driver.wda.bundleIdForXctest} exists and it is launchable.`;
    if (driver.isRealDevice()) {
      errorMsg += ` ${WDA_REAL_DEV_TUTORIAL_URL} may help to complete the preparation.`;
    }
    throw new Error(errorMsg, {cause: err});
  }

  await quitAndThrow(driver, errorMsg);
}

async function establishProxySession(
  driver: XCUITestDriver,
): Promise<InstanceType<typeof errors.TimeoutError> | null> {
  driver.proxyReqRes = driver.wda.proxyReqRes.bind(driver.wda);
  driver.jwpProxyActive = true;

  try {
    driver.logEvent('wdaSessionAttempted');
    driver.log.debug('Sending createSession command to WDA');
    driver.cachedWdaStatus =
      driver.cachedWdaStatus || (await driver.proxyCommand('/status', 'GET'));
    await createWdaSession(driver, driver.opts.bundleId, driver.opts.processArguments);
    driver.logEvent('wdaSessionStarted');
    return null;
  } catch (err) {
    driver.logEvent('wdaSessionFailed');
    if (err instanceof errors.TimeoutError) {
      driver.log.debug(err.stack);
      return err;
    }
    const cause = err instanceof Error ? err : new Error(String(err));
    driver.log.debug(cause.stack);
    let errorMsg = `Unable to start WebDriverAgent session. Original error: ${cause.message}`;
    if (driver.isRealDevice() && _.includes(cause.message, 'xcodebuild')) {
      errorMsg += ` Make sure you follow the tutorial at ${WDA_REAL_DEV_TUTORIAL_URL}.`;
    }
    throw new Error(errorMsg, {cause: err});
  }
}

async function finalizeSuccessfulStartup(driver: XCUITestDriver): Promise<void> {
  if (driver.opts.clearSystemFiles && isXcodebuildNeeded(driver.opts)) {
    await markSystemFilesForCleanup(() => driver.wda.retrieveDerivedDataPath());
  }

  if (driver.cachedWdaStatus?.build) {
    driver.log.info(`WebDriverAgent version: '${driver.cachedWdaStatus.build.version}'`);
  } else {
    driver.log.warn(
      `WebDriverAgent does not provide any version information. ` +
        `This might indicate either a custom or an outdated build.`,
    );
  }

  driver.wda.fullyStarted = true;
  driver.logEvent('wdaStarted');
}

async function createWdaSession(
  driver: XCUITestDriver,
  bundleId?: string,
  processArguments?: any,
): Promise<void> {
  const args = processArguments ? _.cloneDeep(processArguments.args) || [] : [];
  if (!_.isArray(args)) {
    throw new Error(
      `processArguments.args capability is expected to be an array. ` +
        `${JSON.stringify(args)} is given instead`,
    );
  }
  const env = processArguments ? _.cloneDeep(processArguments.env) || {} : {};
  if (!_.isPlainObject(env)) {
    throw new Error(
      `processArguments.env capability is expected to be a dictionary. ` +
        `${JSON.stringify(env)} is given instead`,
    );
  }

  if (util.hasValue(driver.opts.language)) {
    args.push('-AppleLanguages', `(${driver.opts.language})`);
    args.push('-NSLanguages', `(${driver.opts.language})`);
  }
  if (util.hasValue(driver.opts.locale)) {
    args.push('-AppleLocale', driver.opts.locale);
  }

  if (driver.opts.noReset) {
    if (_.isNil(driver.opts.shouldTerminateApp)) {
      driver.opts.shouldTerminateApp = false;
    }
    if (_.isNil(driver.opts.forceAppLaunch)) {
      driver.opts.forceAppLaunch = false;
    }
  }

  if (util.hasValue(driver.opts.appTimeZone)) {
    // https://developer.apple.com/forums/thread/86951?answerId=263395022#263395022
    env.TZ = driver.opts.appTimeZone;
  }

  const wdaCaps: StringRecord = {
    bundleId: driver.opts.autoLaunch === false ? undefined : bundleId,
    arguments: args,
    environment: env,
    eventloopIdleDelaySec: driver.opts.wdaEventloopIdleDelay ?? 0,
    shouldWaitForQuiescence: true,
    maxTypingFrequency: driver.opts.maxTypingFrequency ?? 60,
    shouldUseSingletonTestManager: driver.opts.shouldUseSingletonTestManager ?? true,
    waitForIdleTimeout: driver.opts.waitForIdleTimeout,
    shouldUseCompactResponses: (driver.opts as StringRecord).shouldUseCompactResponses,
    elementResponseFields: (driver.opts as StringRecord).elementResponseFields,
    disableAutomaticScreenshots: driver.opts.disableAutomaticScreenshots,
    shouldTerminateApp: driver.opts.shouldTerminateApp ?? true,
    forceAppLaunch: driver.opts.forceAppLaunch ?? true,
    appLaunchStateTimeoutSec: driver.opts.appLaunchStateTimeoutSec,
    useNativeCachingStrategy: driver.opts.useNativeCachingStrategy ?? true,
    forceSimulatorSoftwareKeyboardPresence:
      driver.opts.forceSimulatorSoftwareKeyboardPresence ??
      (driver.opts.connectHardwareKeyboard === true ? false : true),
  };
  if (driver.opts.autoAcceptAlerts) {
    wdaCaps.defaultAlertAction = 'accept';
  } else if (driver.opts.autoDismissAlerts) {
    wdaCaps.defaultAlertAction = 'dismiss';
  }
  if (driver.opts.initialDeeplinkUrl) {
    driver.log.info(`The deeplink URL will be set to ${driver.opts.initialDeeplinkUrl}`);
    wdaCaps.initialUrl = driver.opts.initialDeeplinkUrl;
  }

  const timer = new timing.Timer().start();
  await driver.proxyCommand('/session', 'POST', {
    capabilities: {
      firstMatch: [wdaCaps],
      alwaysMatch: {},
    },
  });
  driver.log.info(`WDA session startup took ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}

async function quitAndThrow(driver: XCUITestDriver, msg: string): Promise<never> {
  driver.log.debug(msg);
  if (!isXcodebuildNeeded(driver.opts)) {
    driver.log.debug(
      `Not quitting WebDriverAgent since at least one of ${CAP_NAMES_NO_XCODEBUILD_REQUIRED} capabilities is provided`,
    );
    throw new Error(msg);
  }
  driver.log.info('Quitting WebDriverAgent');
  await driver.wda.quit();
  throw new Error(msg);
}
