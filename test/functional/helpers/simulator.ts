import {killAllSimulators as simKill, listSimulators, getSimulator} from 'appium-ios-simulator';
import type {Simulator} from 'appium-ios-simulator';
import {resetTestProcesses} from 'appium-webdriveragent';
import {retryInterval} from 'asyncbox';

import {shutdownSimulator} from '../../../lib/device/simulator-management.js';

export async function killAllSimulators() {
  const allDevices = await listSimulators();
  const bootedDevices = allDevices.filter((device) => device.state === 'Booted');

  for (const {udid, platform} of bootedDevices) {
    // It is necessary to stop the corresponding xcodebuild process before killing
    // the simulator, otherwise it will be automatically restarted
    await resetTestProcesses(udid, true);
    const sim = await getSimulator(udid, {platform, checkExistence: false});
    await sim.shutdown();
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

  const allDevices = await listSimulators();
  const device = allDevices.find((d) => d.name === deviceName);
  if (!device) {
    const available = [...new Set(allDevices.map((d) => d.name))].sort().join(', ');
    throw new Error(`No simulator named '${deviceName}' exists. Available simulators: ${available || '(none)'}`);
  }

  if (device.state !== 'Booted') {
    const sim = await getSimulator(device.udid, {platform: device.platform, checkExistence: false});
    await sim.boot();
    await sim.waitForBoot(LOCAL_SIM_BOOT_TIMEOUT_MS);
  }

  return device.udid;
}

export async function deleteDeviceWithRetry(udid: string): Promise<void> {
  try {
    await retryInterval(10, 1000, async () => {
      const sim = await getSimulator(udid, {checkExistence: false});
      await sim.delete();
    });
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
