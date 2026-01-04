import {assertSimulator as _assertSimulator} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {BiometricFeature} from './types';
import type {Simulator} from 'appium-ios-simulator';

const assertSimulator = (driver: XCUITestDriver) => _assertSimulator.call(driver, 'Biometric enrollment');

/**
 * Enrolls biometric authentication on a simulated device.
 *
 * @param isEnabled - Whether to enable/disable biometric enrollment.
 * @throws If enrollment fails or the device is not a Simulator.
 * @group Simulator Only
 */
export async function mobileEnrollBiometric(
  this: XCUITestDriver,
  isEnabled: boolean = true,
): Promise<void> {
  assertSimulator(this);

  await (this.device as Simulator).enrollBiometric(isEnabled);
}

/**
 * Emulates biometric match or non-match event on a simulated device.
 *
 * The biometric feature is expected to be already enrolled via {@linkcode mobileEnrollBiometric|mobile: enrollBiometric} before executing this.
 *
 * @param type - The biometric feature name.
 * @param match - If `true`, simulate biometric match. If `false`, simulate biometric non-match.
 * @throws If matching fails or the device is not a Simulator.
 * @group Simulator Only
 */
export async function mobileSendBiometricMatch(
  this: XCUITestDriver,
  type: BiometricFeature = 'touchId',
  match: boolean = true,
): Promise<void> {
  assertSimulator(this);

  await (this.device as Simulator).sendBiometricMatch(match, type);
}

/**
 * Checks whether the biometric feature is currently enrolled on a simulated device.
 *
 * @returns `true` if biometric is enrolled.
 * @throws If the detection fails or the device is not a Simulator.
 * @group Simulator Only
 */
export async function mobileIsBiometricEnrolled(
  this: XCUITestDriver,
): Promise<boolean> {
  assertSimulator(this);

  return await (this.device as Simulator).isBiometricEnrolled();
}

