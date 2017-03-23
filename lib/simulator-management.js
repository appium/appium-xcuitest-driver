import path from 'path';
import { getSimulator } from 'appium-ios-simulator';
import { createDevice, getDevices, terminate } from 'node-simctl';
import { waitForCondition } from 'asyncbox';
import { exec } from 'teen_process';
import _ from 'lodash';
import log from './logger';


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

async function prepareSafariForCleanup (timeout = 5000) {
  try {
    await waitForCondition(async () => {
      try {
        await exec('pgrep', ['-x', 'MobileSafari']);
      } catch (e) {
        if (e.code === 1) {
          return true;
        }
        try {
          await exec('pkill', ['-9', '-x', 'MobileSafari']);
        } catch (e1) {
          if (e1.code === 1) {
            return true;
          }
          log.warn(e1.message);
        }
      }
      return false;
    }, {
      waitMs: timeout,
      intervalMs: 200
    });
    log.debug('Mobile Safari process is not running. Continuing with cleanup');
  } catch (err) {
    log.warn(`Mobile Safari is still running after ${timeout} ms`);
  }
}

async function runSimulatorReset (device, opts) {
  if (opts.noReset && !opts.fullReset) {
    // noReset === true && fullReset === false
    log.debug('Reset: noReset is on. Leaving simulator as is');
    return;
  }

  if (!device) {
    log.debug('Reset: no device available. Skipping');
    return;
  }

  if (opts.fullReset) {
    log.debug('Reset: fullReset is on. Cleaning simulator');
    // The simulator process must be ended before we delete applications.
    await endSimulator(device);
    await fullResetSimulator(device);
  } else if (opts.bundleId) {
    // Terminate the app under test if it is still running on Simulator
    // Termination is not needed if Simulator is not running
    if (await simBooted(device)) {
      if (device.xcodeVersion.major >= 8) {
        try {
          await terminate(device.udid, opts.bundleId);
        } catch (err) {
          log.warn(`Reset: failed to terminate Simulator application with id "${opts.bundleId}"`);
        }
      } else {
        await endSimulator(device);
      }
    }
    if (opts.app) {
      log.info('Not scrubbing third party app in anticipation of uninstall');
      return;
    }
    const isSafari = (opts.browserName || '').toLowerCase() === 'safari';
    try {
      if (isSafari) {
        await prepareSafariForCleanup();
        await device.cleanSafari();
      } else {
        await device.scrubCustomApp(path.basename(opts.app), opts.bundleId);
      }
    } catch (err) {
      log.warn(err.message);
      log.warn(`Reset: could not scrub ${isSafari ? 'Safari browser' : 'application with id "' + opts.bundleId + '"'}. Leaving as is.`);
    }
  }
}

async function fullResetSimulator (device) {
  if (!device) {
    return;
  }

  await device.clean();
}

async function endSimulator (device) {
  if (!device) {
    return;
  }

  log.debug('Reset: shutting down simulator');
  await device.shutdown();
}

async function isolateSimulatorDevice (device, isolateSimDevice = true) {
  if (isolateSimDevice) {
    await device.isolateSim();
  }
}

async function installToSimulator (device, app, bundleId, noReset = true) {
  if (!app) {
    log.debug('No app path is given. Nothing to install.');
    return;
  }

  if (bundleId) {
    if (await device.isAppInstalled(bundleId)) {
      if (noReset) {
        log.debug(`App '${bundleId}' is already installed. No need to reinstall.`);
        return;
      }
      log.debug(`Reset requested. Removing app with id '${bundleId}' from the device`);
      await device.removeApp(bundleId);
    }
  }
  log.debug(`Installing ${app} on Simulator with UUID '${device.udid}'...`);
  await device.installApp(app);
  log.debug('The app has been installed successfully.');
}


export { simBooted, createSim, getExistingSim, runSimulatorReset,
         isolateSimulatorDevice, installToSimulator };
