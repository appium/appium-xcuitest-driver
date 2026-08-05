import type {Capabilities} from '@wdio/types';
import type {Browser} from 'webdriverio';

export const HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';
export const PORT = parseInt(String(process.env.APPIUM_TEST_SERVER_PORT), 10) || 4567;
// A modest margin above the server-side wdaLaunchTimeout/wdaConnectionTimeout/
// simulatorStartupTimeout caps (4 min, set in desired.ts) used by these tests: if the
// client-side timeout races those and fires first, the server-side session creation
// still completes moments later, leaving an orphaned session that locks the device
// and cascades into failures for every subsequent test. Genuine WDA-launch hangs are
// not worth waiting out further than this - those should fail (or be skipped) rather
// than balloon the whole suite's runtime.
const E2E_TIMEOUT_MS = 60 * 1000 * 5;

export type SessionCapabilities = Capabilities.RequestedStandaloneCapabilities;

type RemoteSessionOptions = Omit<
  Capabilities.WebdriverIOConfig,
  'hostname' | 'port' | 'capabilities' | 'connectionRetryTimeout' | 'connectionRetryCount'
>;

type TestSessionDriver = Browser & {
  name?: string;
  errored?: boolean;
};

let driver: TestSessionDriver | undefined;

export async function createRemoteSession(
  caps: SessionCapabilities,
  remoteOpts: RemoteSessionOptions = {},
): Promise<Browser> {
  const {remote} = await import('webdriverio');
  return remote({
    hostname: HOST,
    port: PORT,
    capabilities: caps,
    connectionRetryTimeout: E2E_TIMEOUT_MS,
    connectionRetryCount: 1,
    ...remoteOpts,
  });
}

export async function initSession(
  caps: SessionCapabilities,
  remoteOpts: RemoteSessionOptions = {},
): Promise<TestSessionDriver> {
  driver = await createRemoteSession(caps, remoteOpts);
  driver.name = undefined;
  driver.errored = false;
  return driver;
}

export async function deleteRemoteSession(sessionDriver?: Browser): Promise<void> {
  if (!sessionDriver) {
    return;
  }
  try {
    await sessionDriver.deleteSession();
  } catch {}
}

export async function deleteSession(): Promise<void> {
  try {
    await deleteRemoteSession(driver);
  } finally {
    driver = undefined;
  }
}
