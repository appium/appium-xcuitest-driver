import path from 'path';
import { getSimulator } from 'appium-ios-simulator';
import { createDevice, getDevices } from 'node-simctl';
import { retryInterval } from 'asyncbox';
import { fs } from 'appium-support';
import _ from 'lodash';
import log from './logger';


const DEFAULT_SAFARI_URL = 'http://appium.io';

// returns true if sim is booted. false if not booted or doesnt exist
async function simBooted (sim) {
  let stat = await sim.stat();
  return stat.state === 'Booted';
}

// returns sim for desired caps
async function createSim (caps, sessionId) {
  let name = `appiumTest-${sessionId}`;
  let udid = await createDevice(name, caps.deviceName, caps.platformVersion);
  return await getSimulator(udid);
}

async function getExistingSim (deviceName, platformVersion) {
  let devices = await getDevices(platformVersion);
  for (let device of _.values(devices)) {
    if (device.name === deviceName) {
      return await getSimulator(device.udid);
    }
  }
  return null;
}

async function systemLogExists (sim) {
  const TRIES = 500;
  const INTERVAL = 200;

  let logFile = path.resolve(sim.getLogDir(), 'system.log');
  return retryInterval(TRIES, INTERVAL, async () => {
    if (!await fs.exists(logFile)) {
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

async function runSimulatorReset (device, opts) {
  if (opts.noReset && !opts.fullReset) {
    log.debug('Reset not set, not ending sim');
    return;
  }

  log.debug('Running iOS simulator reset flow');

  // The simulator process must be ended before we delete applications.
  await endSimulator(device);

  if (opts.fullReset) {
    log.debug('Full reset is on. Cleaning simulator');
    await fullResetSimulator(device);
  } else {
    await resetSimulator(device, opts);
  }
}

async function fullResetSimulator (device) {
  if (device) {
    await device.clean();
  }
}

async function resetSimulator (device, opts) {
  if (!device) return;

  log.debug('Cleaning simulator state.');
  try {
    await clearAppData(device, opts);
    await device.clean();
  } catch (err) {
    log.warn(err);
    log.warn('Could not reset simulator. Leaving as is.');
  }
}

async function endSimulator (device) {
  if (!device) return;

  log.debug('Shutting down simulator');
  await device.shutdown();
}

async function clearAppData  (device, opts) {
  if (opts.app && opts.bundleId) {
    await device.cleanCustomApp(path.basename(opts.app), opts.bundleId);
  }
}

async function isolateSimulatorDevice (device, isolateSimDevice = true) {
  if (isolateSimDevice) {
    await device.isolateSim();
  }
}


export { simBooted, createSim, systemLogExists, launchSafariOnSim,
         getExistingSim, runSimulatorReset, isolateSimulatorDevice };
