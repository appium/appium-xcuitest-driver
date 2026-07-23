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
