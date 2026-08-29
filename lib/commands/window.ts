import type {Rect, Size} from '@appium/types';
import {errors, isErrorType} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';
import {requireAutomationSessionActive, requireWebContext} from './helpers/index.js';

/**
 * Two different guards show up in this file, matching two different kinds of command:
 * - `setWindow`/`getWindowHandle(s)`/`getWindowRect`/`closeWindow` have an atoms-based
 *   implementation, so they gate on `isWebContext()`/`requireWebContext` and dispatch through
 *   `_webExecutionBackend`, which already picks the right execution mode.
 * - `setWindowRect`/`maximizeWindow`/`minimizeWindow`/`fullScreenWindow` have no atoms
 *   equivalent at all - atoms never supported them - so they gate on
 *   `requireAutomationSessionActive` directly instead, since there's no atoms fallback to
 *   dispatch to.
 */

const DEFAULT_NATIVE_WINDOW_HANDLE = '1';

/**
 * Window/tab handles have no native-context equivalent, so the window-handle commands below
 * return a fixed placeholder (or no-op) there instead of throwing.
 *
 * @see https://github.com/appium/appium/issues/20710
 */
function isNativeContext(driver: XCUITestDriver): boolean {
  return !driver.isWebContext();
}

/**
 * Sets the current window (context) in a web context.
 *
 * This is a wrapper around {@linkcode setContext} that translates errors appropriately.
 *
 * @param name - The window/context name to switch to
 * @param skipReadyCheck - Whether to skip waiting for the window to be ready
 * @throws {errors.NoSuchWindowError} If the window does not exist
 */
export async function setWindow(this: XCUITestDriver, name: string, skipReadyCheck?: boolean): Promise<void> {
  if (isNativeContext(this)) {
    return;
  }
  try {
    await this.setContext(name, () => {}, skipReadyCheck);
  } catch (err) {
    // translate the error in terms of windows
    throw isErrorType(err, errors.NoSuchContextError) ? new errors.NoSuchWindowError() : err;
  }
}

/**
 * Gets the handle of the current window.
 *
 * In native context, returns a default handle. In web context, returns the current context ID.
 *
 * @returns The window handle
 * @throws {errors.InvalidContextError} If not in a valid context
 */
export async function getWindowHandle(this: XCUITestDriver): Promise<string> {
  if (isNativeContext(this)) {
    return DEFAULT_NATIVE_WINDOW_HANDLE;
  }
  if (!this.curContext) {
    throw new errors.InvalidContextError();
  }
  this.log.debug(`Getting current window handle`);
  return await this._webExecutionBackend.getWindowHandle();
}

/**
 * Gets the list of all available window handles.
 *
 * In native context, returns a single default handle. In web context, returns all webview handles.
 *
 * @returns Array of window handle strings
 */
export async function getWindowHandles(this: XCUITestDriver): Promise<string[]> {
  if (isNativeContext(this)) {
    return [DEFAULT_NATIVE_WINDOW_HANDLE];
  }
  this.log.debug('Getting list of available window handles');
  return await this._webExecutionBackend.getWindowHandles();
}

/**
 * Get the window size.
 *
 * @returns The window size (width and height)
 */
export async function getWindowSize(this: XCUITestDriver): Promise<Size> {
  const {width, height} = await this.getWindowRect();
  return {width, height};
}

/**
 * Gets the window rectangle (position and size).
 *
 * For W3C compatibility. In web context, returns the browser window dimensions.
 * In native context, returns the device window dimensions.
 *
 * @returns The window rectangle
 */
export async function getWindowRect(this: XCUITestDriver): Promise<Rect> {
  if (this.isWebContext()) {
    return await this._webExecutionBackend.getWindowRect();
  }

  return (await this.proxyCommand('/window/rect', 'GET')) as Rect;
}

/**
 * Sets the current window's position and/or size.
 *
 * Has no atoms equivalent - only supported once an automation session is active.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If no automation session is active
 */
export async function setWindowRect(
  this: XCUITestDriver,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
): Promise<Rect> {
  const backend = requireAutomationSessionActive(this, 'Setting the window rect');
  await backend.setWindowRect(x, y, width, height);
  return await backend.getWindowRect();
}

/**
 * Maximizes the current window.
 *
 * Has no atoms equivalent - only supported once an automation session is active.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If no automation session is active
 */
export async function maximizeWindow(this: XCUITestDriver): Promise<Rect> {
  const backend = requireAutomationSessionActive(this, 'Maximizing the window');
  await backend.maximizeWindow();
  return await backend.getWindowRect();
}

/**
 * Minimizes the current window.
 *
 * Has no atoms equivalent - only supported once an automation session is active.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If no automation session is active
 */
export async function minimizeWindow(this: XCUITestDriver): Promise<Rect> {
  const backend = requireAutomationSessionActive(this, 'Minimizing the window');
  await backend.minimizeWindow();
  return await backend.getWindowRect();
}

/**
 * Requests fullscreen for the current window.
 *
 * Has no atoms equivalent - only supported once an automation session is active.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If no automation session is active
 */
export async function fullScreenWindow(this: XCUITestDriver): Promise<Rect> {
  const backend = requireAutomationSessionActive(this, 'Requesting fullscreen for the window');
  await backend.fullscreenWindow();
  return await backend.getWindowRect();
}

/**
 * Closes the current window in a web context.
 *
 * @returns Promise resolving to the handles of the windows that remain open,
 * as required by https://www.w3.org/TR/webdriver2/#close-window
 */
export async function closeWindow(this: XCUITestDriver): Promise<string[]> {
  requireWebContext(this);

  await this._webExecutionBackend.closeWindow();
  return await this.getWindowHandles();
}
