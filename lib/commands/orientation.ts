import type {Orientation, Rotation} from '@appium/types';

import type {XCUITestDriver} from '../driver.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    getOrientation(...args: Parameters<typeof getOrientation>): ReturnType<typeof getOrientation>;
    setOrientation(...args: Parameters<typeof setOrientation>): ReturnType<typeof setOrientation>;
    getRotation(...args: Parameters<typeof getRotation>): ReturnType<typeof getRotation>;
    setRotation(...args: Parameters<typeof setRotation>): ReturnType<typeof setRotation>;
  }
}

/**
 * Returns the current device orientation.
 *
 * @returns The current device orientation ('LANDSCAPE' or 'PORTRAIT').
 */
export async function getOrientation(this: XCUITestDriver): Promise<Orientation> {
  return await this.proxyCommand<unknown, Orientation>('/orientation', 'GET');
}

/**
 * Sets the device orientation.
 *
 * @param orientation - The desired orientation ('LANDSCAPE' or 'PORTRAIT').
 */
export async function setOrientation(this: XCUITestDriver, orientation: Orientation): Promise<void> {
  const normalizedOrientation = orientation.toUpperCase() as Orientation;
  await this.proxyCommand(`/orientation`, 'POST', {orientation: normalizedOrientation});
}

/**
 * Returns the current device rotation.
 *
 * @returns Object containing the current device rotation in degrees on each axis
 */
export async function getRotation(this: XCUITestDriver): Promise<Rotation> {
  return await this.proxyCommand<unknown, Rotation>('/rotation', 'GET');
}

/**
 * Sets the device rotation.
 *
 * @param x - The desired rotation in degrees on the X axis
 * @param y - The desired rotation in degrees on the Y axis
 * @param z - The desired rotation in degrees on the Z axis
 */
export async function setRotation(this: XCUITestDriver, x: number, y: number, z: number): Promise<void> {
  await this.proxyCommand(`/rotation`, 'POST', {x, y, z});
}
