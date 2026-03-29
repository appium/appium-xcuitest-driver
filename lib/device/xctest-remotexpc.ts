import {logger} from 'appium/support';
import {errors} from 'appium/driver';
import type {StringRecord} from '@appium/types';
import type {XCTestEvent, XCTestRunnerOptions, XCTestRunStage} from 'appium-ios-remotexpc';
import type {XCTestResult, RunXCTestResult} from '../commands/types';
import {getXCTestRunnerClass} from './remotexpc-utils';
import {InstallationProxyClient} from './installation-proxy-client';

const xctestLog = logger.getLogger('XCTest:RemoteXPC');

/**
 * Run an XCTest suite via RemoteXPC using the high-level XCTestRunner.
 *
 * The XCTestRunner handles the full lifecycle internally:
 * 1. Service discovery (testmanagerd, DVT, InstallationProxy) via single RemoteXPC connection
 * 2. App lookup to resolve test bundle paths
 * 3. Exec/control session initialization
 * 4. Test runner process launch via ProcessControl
 * 5. XCTestConfiguration delivery and test plan execution
 * 6. Event-driven completion with typed callbacks
 * 7. Cleanup (kill process, close connections)
 *
 * Per-test results are collected via XCTestRunner's 'xctest' events.
 */
export async function runXCTestViaRemoteXPC(
  udid: string,
  testRunnerBundleId: string,
  appUnderTestBundleId: string,
  xctestBundleId: string,
  testType: 'app' | 'ui' | 'logic' = 'ui',
  args: string[] = [],
  env?: StringRecord,
  timeout = 360000,
): Promise<RunXCTestResult> {
  // Logic tests don't use testmanagerd — skip RemoteXPC
  if (testType === 'logic') {
    throw new Error('Logic tests are not supported via RemoteXPC');
  }

  const XCTestRunnerClass = await getXCTestRunnerClass();

  const runnerOptions: XCTestRunnerOptions = {
    udid,
    testRunnerBundleId,
    appUnderTestBundleId,
    xctestBundleId,
    timeoutMs: timeout,
    launchEnvironment: env as Record<string, string>,
    launchArguments: args,
    killExisting: true,
    testType, // Already narrowed to 'ui' | 'app' after the logic-test guard above
  };

  const runner = new XCTestRunnerClass(runnerOptions);

  // Collect per-test results from typed events
  const results: XCTestResult[] = [];
  const pendingFailures = new Map<string, {message: string; location: string}>();

  runner.on('xctest', (event: XCTestEvent) => {
    switch (event.type) {
      case 'testCaseFailed': {
        const identifier = `${event.testClass}/${event.method}`;
        pendingFailures.set(identifier, {
          message: event.message,
          location: `${event.file}:${event.line}`,
        });
        break;
      }

      case 'testCaseFinished': {
        const passed = event.status === 'passed';
        const crashed = event.status === 'crashed';

        const result: XCTestResult = {
          testName: event.identifier,
          passed,
          crashed,
          status: event.status || 'failed',
          duration: event.duration,
        };

        // Attach pending failure info if any
        const failure = pendingFailures.get(event.identifier);
        if (failure) {
          result.failureMessage = failure.message;
          result.location = failure.location;
          pendingFailures.delete(event.identifier);
        }

        results.push(result);
        break;
      }

      default:
        break;
    }
  });

  runner.on('step', (stage: XCTestRunStage) => {
    xctestLog.info(`XCTest step: ${stage}`);
  });

  const runResult = await runner.run();

  if (runResult.error) {
    xctestLog.warn(`XCTest run completed with error: ${runResult.error}`);
  }

  if (runResult.status === 'timed_out') {
    throw new errors.TimeoutError(
      `Timed out after '${timeout}ms' waiting for XCTest to complete via RemoteXPC`,
    );
  }

  const allPassed =
    results.length > 0
      ? results.every((r) => r.passed)
      : (runResult.testSummary?.failureCount ?? 0) === 0;
  return {
    results,
    code: allPassed ? 0 : 1,
    signal: null,
    passed: allPassed,
  };
}

/**
 * List XCTest bundles installed on the device via RemoteXPC.
 * Uses InstallationProxy to browse apps and filter for xctrunner bundles.
 */
export async function listXCTestBundlesViaRemoteXPC(udid: string): Promise<string[]> {
  const installProxy = await InstallationProxyClient.create(udid, true);
  try {
    const apps = await installProxy.listApplications({
      applicationType: 'User',
      returnAttributes: ['CFBundleIdentifier', 'CFBundleExecutable', 'Path'],
    });

    const bundles: string[] = [];
    for (const [bundleId, info] of Object.entries(apps)) {
      // Match xctrunner bundles or apps whose path contains .xctest
      if (bundleId.endsWith('.xctrunner') || (info.Path && String(info.Path).includes('.xctest'))) {
        bundles.push(bundleId);
      }
    }

    return bundles;
  } finally {
    await installProxy.close();
  }
}

/**
 * Install an XCTest bundle via RemoteXPC.
 * Only supports .ipa and .app bundles. Throws for bare .xctest bundles
 * to trigger IDB fallback.
 */
export async function installXCTestBundleViaRemoteXPC(
  udid: string,
  xctestApp: string,
): Promise<void> {
  // Only support .ipa and .app — bare .xctest requires IDB
  if (xctestApp.endsWith('.xctest')) {
    throw new Error(
      'Bare .xctest bundles cannot be installed via RemoteXPC. ' +
        'Falling back to IDB for installation.',
    );
  }

  const installProxy = await InstallationProxyClient.create(udid, true);
  try {
    await installProxy.installApplication(xctestApp);
    xctestLog.info(`Installed XCTest bundle: ${xctestApp}`);
  } finally {
    await installProxy.close();
  }
}
