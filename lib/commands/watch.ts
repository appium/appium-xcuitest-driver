import type {XCUITestDriver} from '../driver.js';
import {requireWatchOs} from './helpers/index.js';
import type {HandGestureName} from './types.js';

/**
 * Rotates the Digital Crown on a watchOS Simulator.
 *
 * Wraps [`rotateDigitalCrown(delta:velocity:)`](https://developer.apple.com/documentation/xcuiautomation/xcuidevice/rotatedigitalcrown(delta:velocity:)).
 *
 * @param delta - The number of full crown rotations, e.g. `1.0` is one complete turn. The sign
 * gives the direction: positive rotates up/clockwise, negative rotates down/counterclockwise.
 * @param velocity - The rotation speed, in rotations per second. If omitted, XCTest's own default
 * velocity is used.
 * @group watchOS Only
 */
export async function mobileRotateDigitalCrown(
  this: XCUITestDriver,
  delta: number,
  velocity?: number,
): Promise<void> {
  requireWatchOs(this, 'Digital Crown rotation');
  return await this.proxyCommand('/wda/rotateDigitalCrown', 'POST', {delta, velocity});
}

/**
 * Performs a hand gesture on a watchOS Simulator.
 *
 * Wraps [`perform(handGesture:)`](https://developer.apple.com/documentation/xcuiautomation/xcuidevice/perform(handgesture:)).
 *
 * @param name - The name of the hand gesture to perform (case-insensitive). One of `doubleTap`
 * (watchOS 10+) or `flick` (watchOS 26+).
 * @group watchOS Only
 */
export async function mobilePerformHandGesture(this: XCUITestDriver, name: HandGestureName): Promise<void> {
  requireWatchOs(this, 'Hand gesture automation');
  return await this.proxyCommand('/wda/performHandGesture', 'POST', {name});
}
