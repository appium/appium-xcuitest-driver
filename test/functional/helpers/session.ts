const HOST = process.env.APPIUM_TEST_SERVER_HOST || '127.0.0.1';
const PORT = parseInt(String(process.env.APPIUM_TEST_SERVER_PORT), 10) || 4567;
const MOCHA_TIMEOUT = 60 * 1000 * 4;

let driver;

async function initSession(caps, remoteOpts = {}) {
  const {remote} = await import('webdriverio');
  driver = await remote({
    hostname: HOST,
    port: PORT,
    capabilities: caps,
    connectionRetryTimeout: MOCHA_TIMEOUT,
    connectionRetryCount: 1,
    ...remoteOpts,
  });
  // @ts-ignore private API, apparently
  driver.name = undefined;
  // @ts-ignore private API, apparently
  driver.errored = false;
  return driver;
}

async function deleteSession() {
  try {
    await driver.deleteSession();
  } catch {
  } finally {
    driver = undefined;
  }
}

export {initSession, deleteSession, HOST, PORT, MOCHA_TIMEOUT};

