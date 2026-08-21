import {killAllSimulators as simKill} from 'appium-ios-simulator';
import type {Simulator} from 'appium-ios-simulator';
import {resetTestProcesses} from 'appium-webdriveragent';
import {retryInterval} from 'asyncbox';
import {Simctl} from 'node-simctl';

import {shutdownSimulator} from '../../../lib/device/simulator-management.js';

export async function killAllSimulators() {
  const simctl = new Simctl();
  const allDevices = Object.values(await simctl.getDevices()).flat();
  const bootedDevices = allDevices.filter((device) => device.state === 'Booted');

  for (const {udid} of bootedDevices) {
    // It is necessary to stop the corresponding xcodebuild process before killing
    // the simulator, otherwise it will be automatically restarted
    await resetTestProcesses(udid, true);
    simctl.udid = udid;
    await simctl.shutdownDevice();
  }
  await simKill();
}

const LOCAL_SIM_BOOT_TIMEOUT_MS = 60 * 1000 * 5;

/**
 * Locates the simulator tvOS/watchOS functional tests should run against.
 *
 * In CI, the workflow boots and settles a simulator ahead of time (via
 * `futureware-tech/simulator-action` + `scripts/ci/wait-for-simulator-idle.mjs`) and passes its
 * UDID through `SIMULATOR_UDID` - these tests must not boot their own there, since CI applies the
 * settle-wait stability fix once per job, not once per test file.
 *
 * Locally (no CI env), that setup isn't guaranteed, so this boots the existing simulator matching
 * deviceName if it isn't already running. It never creates a new device - if none matches, it
 * throws and lists what's available.
 */
export async function getTargetDevice(deviceName: string): Promise<string> {
  if (process.env.CI) {
    if (!process.env.SIMULATOR_UDID) {
      throw new Error(
        'SIMULATOR_UDID is not set. In CI, these tests expect the workflow to have already booted ' +
          'and settled a simulator (see .github/workflows/functional-test.yml) and passed its UDID through.',
      );
    }
    return process.env.SIMULATOR_UDID;
  }

  const simctl = new Simctl();
  const allDevices = Object.values(await simctl.getDevices()).flat();
  const device = allDevices.find((d) => d.name === deviceName);
  if (!device) {
    const available = [...new Set(allDevices.map((d) => d.name))].sort().join(', ');
    throw new Error(`No simulator named '${deviceName}' exists. Available simulators: ${available || '(none)'}`);
  }

  if (device.state !== 'Booted') {
    simctl.udid = device.udid;
    await simctl.startBootMonitor({shouldPreboot: true, timeout: LOCAL_SIM_BOOT_TIMEOUT_MS});
  }

  return device.udid;
}

export async function deleteDeviceWithRetry(udid: string): Promise<void> {
  const simctl = new Simctl({udid});
  try {
    await retryInterval(10, 1000, simctl.deleteDevice.bind(simctl));
  } catch {}
}

export async function cleanupSimulator(sim: Simulator | null): Promise<void> {
  if (!sim) {
    return;
  }
  await resetTestProcesses(sim.udid, true);
  await sim.shutdown();
  await deleteDeviceWithRetry(sim.udid);
}

export {shutdownSimulator};
