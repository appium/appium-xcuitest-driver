import path from 'path';
import { getSimulator } from 'appium-ios-simulator';
import { createDevice } from 'node-simctl';
import { retryInterval } from 'asyncbox';
import { fs } from 'appium-support';

const DEFAULT_SAFARI_URL = 'http://appium.io';

// returns true if sim is booted. false if not booted or doesnt exist
async function simBooted (udid) {
  let sim = await getSimulator(udid);
  let stat = await sim.stat();
  return stat.state === 'Booted';
}

// returns sim for desired caps
async function createSim (caps, sessionId) {
  let name = `appiumTest-${sessionId}`;
  let udid = await createDevice(name, caps.deviceName, caps.platformVersion);
  return await getSimulator(udid);
}

async function systemLogExists (sim) {
  const TRIES = 500;
  const INTERVAL = 200;
  return retryInterval(TRIES, INTERVAL, async () => {
    if (!await fs.exists(path.resolve(sim.getLogDir(), 'system.log'))) {
      throw new Error('system.log does not exist');
    }
  });
}

async function launchSafariOnSim (initialUrl, sim) {
  if (!initialUrl) {
    initialUrl = DEFAULT_SAFARI_URL;
  }

  return await sim.openUrl(initialUrl);
}

export { simBooted, createSim, systemLogExists, launchSafariOnSim };
