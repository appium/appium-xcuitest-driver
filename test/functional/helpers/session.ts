import type {Capabilities} from '@wdio/types';
import type {Browser} from 'webdriverio';

export const HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';
export const PORT = parseInt(String(process.env.APPIUM_TEST_SERVER_PORT), 10) || 4567;
const E2E_TIMEOUT_MS = 60 * 1000 * 4;

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
