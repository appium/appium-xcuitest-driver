import type {XCUITestDriver} from '../driver.js';
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
