import _ from 'lodash';
import {errors} from 'appium/driver';
import moment from 'moment-timezone';
import {utilities} from 'appium-ios-device';
import {exec} from 'teen_process';
import type {XCUITestDriver} from '../driver';
import type {Viewport, ScreenInfo, ButtonName} from './types';
import type {Size, Rect} from '@appium/types';
import type {Simulator} from 'appium-ios-simulator';

const MOMENT_FORMAT_ISO8601 = 'YYYY-MM-DDTHH:mm:ssZ';

/**
 * Gets the currently active element.
 *
 * In web context, returns the active element from the DOM.
 * In native context, returns the active element from the current view.
 *
 * @returns The active element
 */
export async function active(this: XCUITestDriver): Promise<any> {
  if (this.isWebContext()) {
    return this.cacheWebElements(await this.executeAtom('active_element', []));
  }
  return await this.proxyCommand(`/element/active`, 'GET');
}

/**
 * Trigger a touch/fingerprint match or match failure.
 *
 * @param match - Whether the match should be a success or failure
 */
export async function touchId(this: XCUITestDriver, match = true): Promise<void> {
  await this.mobileSendBiometricMatch('touchId', match);
}

/**
 * Toggle whether the device is enrolled in the touch ID program.
 *
 * @param isEnabled - Whether to enable or disable the touch ID program
 */
export async function toggleEnrollTouchId(this: XCUITestDriver, isEnabled = true): Promise<void> {
  await this.mobileEnrollBiometric(isEnabled);
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
 * Retrieves the actual device time.
 *
 * @param format - The format specifier string. Read the [MomentJS documentation](https://momentjs.com/docs/) to get the full list of supported datetime format specifiers. The default format is `YYYY-MM-DDTHH:mm:ssZ`, which complies to ISO-8601.
 * @returns Formatted datetime string or the raw command output (if formatting fails)
 */
export async function getDeviceTime(
  this: XCUITestDriver,
  format = MOMENT_FORMAT_ISO8601,
): Promise<string> {
  this.log.info('Attempting to capture iOS device date and time');
  if (!this.isRealDevice()) {
    this.log.info('On simulator. Assuming device time is the same as host time');
    const cmd = 'date';
    const args = ['+%Y-%m-%dT%H:%M:%S%z'];
    const inputFormat = 'YYYY-MM-DDTHH:mm:ssZZ';
    const stdout = (await exec(cmd, args)).stdout.trim();
    this.log.debug(`Got the following output out of '${cmd} ${args.join(' ')}': ${stdout}`);
    const parsedTimestamp = moment.utc(stdout, inputFormat);
    if (!parsedTimestamp.isValid()) {
      this.log.warn(
        `Cannot parse the timestamp '${stdout}' returned by '${cmd}' command. Returning it as is`,
      );
      return stdout;
    }
    // @ts-expect-error This internal prop of moment is evidently a private API
    return parsedTimestamp.utcOffset(parsedTimestamp._tzm || 0).format(format);
  }

  const {timestamp, utcOffset, timeZone} = await utilities.getDeviceTime(this.opts.udid);
  this.log.debug(`timestamp: ${timestamp}, utcOffset: ${utcOffset}, timeZone: ${timeZone}`);
  const utc = moment.unix(timestamp).utc();
  // at some point of time Apple started to return timestamps
  // in utcOffset instead of actual UTC offsets
  if (Math.abs(utcOffset) <= 12 * 60) {
    return utc.utcOffset(utcOffset).format(format);
  }
  // timeZone could either be a time zone name or
  // an UTC offset in seconds
  if (_.includes(timeZone, '/')) {
    return utc.tz(timeZone).format(format);
  }
  if (Math.abs(timeZone) <= 12 * 60 * 60) {
    return utc.utcOffset(timeZone / 60).format(format);
  }
  this.log.warn('Did not know how to apply the UTC offset. Returning the timestamp without it');
  return utc.format(format);
}

/**
 * Retrieves the current device time.
 *
 * This is a wrapper around {@linkcode getDeviceTime}.
 *
 * @param format - See {@linkcode getDeviceTime.format}
 * @returns Formatted datetime string or the raw command output if formatting fails
 */
export async function mobileGetDeviceTime(
  this: XCUITestDriver,
  format = MOMENT_FORMAT_ISO8601,
): Promise<string> {
  return await this.getDeviceTime(format);
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
    const script = 'return {' +
      'x: window.screenX || 0,' +
      'y: window.screenY || 0,' +
      'width: window.innerWidth,' +
      'height: window.innerHeight' +
    '}';
    return await this.executeAtom('execute_script', [script]);
  }

  return (await this.proxyCommand('/window/rect', 'GET')) as Rect;
}

/**
 * Removes/uninstalls the given application from the device under test.
 *
 * This is a wrapper around {@linkcode mobileRemoveApp mobile: removeApp}.
 *
 * @param bundleId - The bundle identifier of the application to be removed
 * @returns `true` if the application has been removed successfully; `false` otherwise
 */
export async function removeApp(this: XCUITestDriver, bundleId: string): Promise<boolean> {
  return await this.mobileRemoveApp(bundleId);
}

/**
 * Launches the app.
 *
 * @deprecated This API has been deprecated and is not supported anymore.
 * Consider using corresponding 'mobile:' extensions to manage the state of the app under test.
 * @throws {Error} Always throws an error indicating the API is deprecated
 */
export async function launchApp(this: XCUITestDriver): Promise<void> {
  throw new Error(
    `The launchApp API has been deprecated and is not supported anymore. ` +
      `Consider using corresponding 'mobile:' extensions to manage the state of the app under test.`,
  );
}

/**
 * Closes the app.
 *
 * @deprecated This API has been deprecated and is not supported anymore.
 * Consider using corresponding 'mobile:' extensions to manage the state of the app under test.
 * @throws {Error} Always throws an error indicating the API is deprecated
 */
export async function closeApp(this: XCUITestDriver): Promise<void> {
  throw new Error(
    `The closeApp API has been deprecated and is not supported anymore. ` +
      `Consider using corresponding 'mobile:' extensions to manage the state of the app under test.`,
  );
}

/**
 * Sets the URL for the current session.
 *
 * In web context, navigates to the URL using the remote debugger.
 * In native context on real devices, uses the proxy command.
 * In native context on simulators, uses simctl to open the URL.
 *
 * @param url - The URL to navigate to
 */
export async function setUrl(this: XCUITestDriver, url: string): Promise<void> {
  this.log.debug(`Attempting to set url '${url}'`);

  if (this.isWebContext()) {
    this.setCurrentUrl(url);
    // make sure to clear out any leftover web frames
    this.curWebFrames = [];
    await this.remote.navToUrl(url);
    return;
  }

  if (this.isRealDevice()) {
    await this.proxyCommand('/url', 'POST', {url});
  } else {
    await (this.device as Simulator).simctl.openUrl(url);
  }
}

/**
 * Retrieves the viewport dimensions.
 *
 * The viewport is the device's screen size with status bar size subtracted if the latter is present/visible.
 *
 * @returns The viewport rectangle
 */
export async function getViewportRect(this: XCUITestDriver): Promise<Viewport> {
  const scale = await this.getDevicePixelRatio();
  // status bar height comes in unscaled, so scale it
  const statusBarHeight = Math.trunc((await this.getStatusBarHeight()) * scale);
  const windowSize = await this.getWindowRect();

  // ios returns coordinates/dimensions in logical pixels, not device pixels,
  // so scale up to device pixels. status bar height is already scaled.
  return {
    left: 0,
    top: statusBarHeight,
    width: Math.trunc(windowSize.width * scale),
    height: Math.trunc(windowSize.height * scale) - statusBarHeight,
  };
}

/**
 * Get information about the screen.
 *
 * @privateRemarks memoized in constructor
 * @returns Screen information including dimensions, scale, and status bar size
 */
export async function getScreenInfo(this: XCUITestDriver): Promise<ScreenInfo> {
  return (await this.proxyCommand('/wda/screen', 'GET')) as ScreenInfo;
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
 * @privateRemarks memoized in constructor
 * @returns The device pixel ratio (scale factor)
 */
export async function getDevicePixelRatio(this: XCUITestDriver): Promise<number> {
  const {scale} = await this.getScreenInfo();
  return scale;
}

/**
 * Emulates press action on the given physical device button.
 *
 * This executes different methods based on the platform:
 *
 * - iOS: [`pressButton:`](https://developer.apple.com/documentation/xctest/xcuidevice/1619052-pressbutton)
 * - tvOS: [`pressButton:`](https://developer.apple.com/documentation/xctest/xcuiremote/1627475-pressbutton) or [`pressButton:forDuration:`](https://developer.apple.com/documentation/xctest/xcuiremote/1627476-pressbutton)
 *
 * Use {@linkcode mobilePerformIoHidEvent} to call a more universal API to perform a button press with duration on any supported device.
 *
 * @param name - The name of the button to be pressed
 * @param durationSeconds - The duration of the button press in seconds (float)
 */
export async function mobilePressButton(
  this: XCUITestDriver,
  name: ButtonName,
  durationSeconds?: number,
): Promise<void> {
  if (!name) {
    throw new errors.InvalidArgumentError('Button name is mandatory');
  }
  if (!_.isNil(durationSeconds) && !_.isNumber(durationSeconds)) {
    throw new errors.InvalidArgumentError('durationSeconds should be a number');
  }
  return await this.proxyCommand('/wda/pressButton', 'POST', {name, duration: durationSeconds});
}

/**
 * Process a string as speech and send it to Siri.
 *
 * Presents the Siri UI, if it is not currently active, and accepts a string which is then processed as if it were recognized speech. See [the documentation of `activateWithVoiceRecognitionText`](https://developer.apple.com/documentation/xctest/xcuisiriservice/2852140-activatewithvoicerecognitiontext?language=objc) for more details.
 *
 * @param text - Text to be sent to Siri
 */
export async function mobileSiriCommand(this: XCUITestDriver, text: string): Promise<void> {
  if (!text) {
    throw new errors.InvalidArgumentError('"text" argument is mandatory');
  }
  await this.proxyCommand('/wda/siri/activate', 'POST', {text});
}

