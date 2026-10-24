import type {Simulator} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../../driver.js';

/** Detect a hinge-capable simulator without assuming display IDs or a model name. */
export async function getDuoSimulator(driver: XCUITestDriver): Promise<Simulator | undefined> {
  if (!driver.isSimulator() || ['tvos', 'watchos'].includes(String(driver.opts.platformName).toLowerCase())) {
    return undefined;
  }
  try {
    await driver.mobileGetSimulatedHingeAngle();
  } catch (err) {
    if (err instanceof errors.UnsupportedOperationError || err instanceof errors.UnknownCommandError) {
      return undefined;
    }
    throw err;
  }
  return driver.device as Simulator;
}
