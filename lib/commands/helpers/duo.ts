import type {Simulator, SupportsDuo} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../../driver.js';

const duoCache = new WeakMap<
  XCUITestDriver,
  {sessionId: string | null; device: XCUITestDriver['device']; result: Promise<boolean>}
>();

/** Use WDA hinge support for Duo routing on simulators and physical devices. */
export async function isDuo(driver: XCUITestDriver): Promise<boolean> {
  const cached = duoCache.get(driver);
  if (cached && cached.sessionId === driver.sessionId && cached.device === driver.device) {
    return await cached.result;
  }
  const result = (async () => {
    const {hasHinge} = await driver.mobileGetDeviceInfo();
    return hasHinge === true;
  })();
  const entry = {sessionId: driver.sessionId, device: driver.device, result};
  duoCache.set(driver, entry);
  try {
    return await result;
  } catch (err) {
    // Retry transient WDA failures instead of caching a non-Duo result.
    if (duoCache.get(driver) === entry) {
      duoCache.delete(driver);
    }
    throw err;
  }
}

/** Select Duo controls by device type, not hinge or multiple-display capability. */
export async function getDuoSimulator(driver: XCUITestDriver): Promise<(Simulator & SupportsDuo) | undefined> {
  if (!driver.isSimulator() || ['tvos', 'watchos'].includes(String(driver.opts.platformName).toLowerCase())) {
    return undefined;
  }
  const simulator = driver.device as Simulator;
  if (typeof simulator.isDuo !== 'function' || !(await simulator.isDuo())) {
    return undefined;
  }
  if (typeof simulator.setSimulatedHingeAngle !== 'function') {
    return undefined;
  }
  return simulator as Simulator & SupportsDuo;
}

/** Translate native argument validation at the simulator command boundary. */
export async function withDuoArgumentErrors(command: () => Promise<void>): Promise<void> {
  try {
    await command();
  } catch (err) {
    if (err instanceof TypeError) {
      throw new errors.InvalidArgumentError(err.message);
    }
    throw err;
  }
}
