import {setTimeout as delay} from 'node:timers/promises';

import type {SupportsDuo} from 'appium-ios-simulator';
import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';
import {getDuoSimulator} from './helpers/duo.js';
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
  if (!Number.isFinite(angle) || angle < 0 || angle > 180) {
    throw new errors.InvalidArgumentError('angle must be a finite number between 0 and 180 degrees');
  }
  const simulator = await getDuoSimulator(this);
  if (!simulator) {
    throw new errors.UnsupportedOperationError('Setting the hinge angle requires an iPhone Duo Simulator on Xcode 27+');
  }
  await simulator.setSimulatedHingeAngle(angle);
}

const ORIENTATIONS = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape-left',
  UIA_DEVICE_ORIENTATION_LANDSCAPERIGHT: 'landscape-right',
  UIA_DEVICE_ORIENTATION_PORTRAIT_UPSIDEDOWN: 'portrait-upside-down',
} as const;

async function rotateDuo(
  driver: XCUITestDriver,
  orientation: Parameters<SupportsDuo['setHidOrientation']>[0],
): Promise<boolean> {
  const simulator = await getDuoSimulator(driver);
  if (!simulator) {
    return false;
  }
  const displays = await driver.mobileListDisplays();
  const {currentDisplayId} = driver.settings.getSettings();
  const display =
    currentDisplayId == null
      ? displays.find(({isDefault}) => isDefault)
      : displays.find(({id}) => id === currentDisplayId);
  if (!display) {
    throw new errors.InvalidArgumentError(`Display '${currentDisplayId}' is unavailable`);
  }
  await simulator.setHidOrientation(orientation, display.isDefault);
  return true;
}

const ROTATION_Z = {portrait: 0, 'portrait-upside-down': 180, 'landscape-left': 270, 'landscape-right': 90} as const;

/** Wait for the app scene; HID submission alone does not confirm rotation. */
async function waitForDuoRotation(driver: XCUITestDriver, z: number): Promise<void> {
  const deadline = Date.now() + 5000;
  do {
    const rotation = (await driver.proxyCommand('/rotation', 'GET')) as {x: number; y: number; z: number} | null;
    if (rotation?.x === 0 && rotation?.y === 0 && rotation?.z === z) {
      return;
    }
    await delay(100);
  } while (Date.now() < deadline);
  throw new errors.InvalidElementStateError(`The app did not rotate to ${z} degrees within 5000 ms`);
}

/** Submit Duo's host control, then read the app scene without changing XCTest's orientation. */
export async function setOrientation(this: XCUITestDriver, orientation: string): Promise<void> {
  const target = ORIENTATIONS[orientation.toUpperCase() as keyof typeof ORIENTATIONS];
  if (target && (await rotateDuo(this, target))) {
    await waitForDuoRotation(this, ROTATION_Z[target]);
    return;
  }
  await this.proxyCommand('/orientation', 'POST', {orientation});
}

export async function setRotation(this: XCUITestDriver, x: number, y: number, z: number): Promise<void> {
  const targets = {0: 'portrait', 90: 'landscape-right', 180: 'portrait-upside-down', 270: 'landscape-left'} as const;
  const target = targets[z as keyof typeof targets];
  if (x === 0 && y === 0 && target && (await rotateDuo(this, target))) {
    await waitForDuoRotation(this, z);
    return;
  }
  await this.proxyCommand('/rotation', 'POST', {x, y, z});
}
