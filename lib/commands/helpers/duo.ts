import type {Simulator, SupportsDuo} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../../driver.js';

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
