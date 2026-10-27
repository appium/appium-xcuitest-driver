import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';
import {getDuoSimulator, withDuoArgumentErrors} from './helpers/duo.js';
import type {Viewport, ScreenInfo, DisplayInfo, WDADisplayInfo} from './types.js';

/**
 * Retrieves the viewport dimensions.
 *
 * The viewport is the device's screen size with status bar size subtracted if the latter is present/visible.
 *
 * @returns The viewport rectangle
 */
export async function getViewportRect(this: XCUITestDriver): Promise<Viewport> {
  // Read both values together: display selection, orientation and status bar
  // visibility can change during a session.
  const {scale, statusBarSize, screenSize} = await this.getScreenInfo();
  const statusBarHeight = Math.trunc(statusBarSize.height * scale);
  const size = screenSize ?? (await this.getWindowRect());

  // ios returns coordinates/dimensions in logical pixels, not device pixels,
  // so scale up to device pixels. status bar height is already scaled.
  return {
    left: 0,
    top: statusBarHeight,
    width: Math.trunc(size.width * scale),
    height: Math.trunc(size.height * scale) - statusBarHeight,
  };
}

/**
 * Get fresh information about the screen from WDA.
 *
 * @returns Screen information including dimensions, scale, and status bar size
 */
export async function getScreenInfo(this: XCUITestDriver): Promise<ScreenInfo> {
  return (await this.proxyCommand('/wda/screen', 'GET')) as ScreenInfo;
}

/**
 * Lists the displays available to the device under test.
 *
 * @returns Information about each display, including its identifier
 */
export async function mobileListDisplays(this: XCUITestDriver): Promise<DisplayInfo[]> {
  const displayInfo = (await this.proxyCommand('/wda/screens', 'GET')) as WDADisplayInfo[];
  return displayInfo.map(({displayId, isMain, scale, bounds, traits}) => ({
    id: displayId,
    metrics: {
      widthPixels: bounds.width,
      heightPixels: bounds.height,
      xStart: bounds.x,
      yStart: bounds.y,
      density: scale,
      traits,
    },
    isDefault: isMain,
  }));
}

/**
 * Gets the status bar height.
 *
 * @returns The height of the status bar in logical pixels
 */
export async function getStatusBarHeight(this: XCUITestDriver): Promise<number> {
  const {statusBarSize} = await this.getScreenInfo();
  return statusBarSize.height;
}

/**
 * Gets the device pixel ratio.
 *
 * @returns The device pixel ratio (scale factor)
 */
export async function getDevicePixelRatio(this: XCUITestDriver): Promise<number> {
  const {scale} = await this.getScreenInfo();
  return scale;
}

/**
 * Reads the current hinge angle in degrees, including changes made outside WDA.
 * Requires a WDA build with GET /wda/device/hingeAngle support.
 * WDA checks platform, hinge and CoreMotion availability and waits up to five seconds for a valid reading.
 * A reading may reflect an intermediate angle during folding.
 */
export async function mobileGetSimulatedHingeAngle(this: XCUITestDriver): Promise<number> {
  return await this.proxyCommand('/wda/device/hingeAngle', 'GET');
}

/**
 * Requests a simulated hinge angle through the host CoreSimulator HID service.
 * Requires an iPhone Duo Simulator on Xcode 27+; CoreSimulator identifies the device type.
 * WDA supplies hinge angle readings.
 * The transition completes asynchronously. Select currentDisplayId separately.
 *
 * @param angle - Degrees from 0 (closed) to 180 (fully open), inclusive.
 */
export async function mobileSetSimulatedHingeAngle(this: XCUITestDriver, angle: number): Promise<void> {
  const simulator = await getDuoSimulator(this);
  if (!simulator) {
    throw new errors.UnsupportedOperationError('Setting the hinge angle requires an iPhone Duo Simulator on Xcode 27+');
  }
  await withDuoArgumentErrors(() => simulator.setSimulatedHingeAngle(angle));
}
