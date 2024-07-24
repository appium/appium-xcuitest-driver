import _ from 'lodash';
import {errors} from 'appium/driver';
import moment from 'moment-timezone';
import {utilities} from 'appium-ios-device';
import {exec} from 'teen_process';

const MOMENT_FORMAT_ISO8601 = 'YYYY-MM-DDTHH:mm:ssZ';

const commands = {
  /**
   * @this {XCUITestDriver}
   */
  async active() {
    if (this.isWebContext()) {
      return this.cacheWebElements(await this.executeAtom('active_element', []));
    }
    return await this.proxyCommand(`/element/active`, 'GET');
  },

  /**
   * Trigger a touch/fingerprint match or match failure
   *
   * @param {boolean} match - whether the match should be a success or failure
   * @this {XCUITestDriver}
   */
  async touchId(match = true) {
    await this.mobileSendBiometricMatch('touchId', match);
  },
  /**
   * Toggle whether the device is enrolled in the touch ID program
   *
   * @param {boolean} isEnabled - whether to enable or disable the touch ID program
   *
   * @this {XCUITestDriver}
   */
  async toggleEnrollTouchId(isEnabled = true) {
    await this.mobileEnrollBiometric(isEnabled);
  },
  /**
   * Get the window size
   * @this {XCUITestDriver}
   * @deprecated Use {@linkcode XCUITestDriver.getWindowRect} instead.
   */
  async getWindowSize(windowHandle = 'current') {
    if (windowHandle !== 'current') {
      throw new errors.NotYetImplementedError(
        'Currently only getting current window size is supported.',
      );
    }

    if (!this.isWebContext()) {
      return await this.getWindowSizeNative();
    } else {
      return await this.getWindowSizeWeb();
    }
  },

  /**
   * Retrieves the actual device time.
   *
   * @param {string} format - The format specifier string. Read the [MomentJS documentation](https://momentjs.com/docs/) to get the full list of supported datetime format specifiers. The default format is `YYYY-MM-DDTHH:mm:ssZ`, which complies to ISO-8601.
   * @returns {Promise<string>} Formatted datetime string or the raw command output (if formatting fails)
   * @this {XCUITestDriver}
   */
  async getDeviceTime(format = MOMENT_FORMAT_ISO8601) {
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
  },

  /**
   * Retrieves the current device time
   *
   * @param {string} format - See {@linkcode getDeviceTime.format}
   * @returns {Promise<string>} Formatted datetime string or the raw command output if formatting fails
   * @this {XCUITestDriver}
   */
  async mobileGetDeviceTime(format = MOMENT_FORMAT_ISO8601) {
    return await this.getDeviceTime(format);
  },

  /**
   * For W3C
   * @this {XCUITestDriver}
   */
  async getWindowRect() {
    const {width, height} = await this.getWindowSize();
    return {
      width,
      height,
      x: 0,
      y: 0,
    };
  },
  /**
   * @this {XCUITestDriver}
   */
  async removeApp(bundleId) {
    return await this.mobileRemoveApp(bundleId);
  },
  /**
   * @this {XCUITestDriver}
   */
  // eslint-disable-next-line require-await
  async launchApp() {
    throw new Error(
      `The launchApp API has been deprecated and is not supported anymore. ` +
        `Consider using corresponding 'mobile:' extensions to manage the state of the app under test.`,
    );
  },
  /**
   * @this {XCUITestDriver}
   */
  // eslint-disable-next-line require-await
  async closeApp() {
    throw new Error(
      `The closeApp API has been deprecated and is not supported anymore. ` +
        `Consider using corresponding 'mobile:' extensions to manage the state of the app under test.`,
    );
  },
  /**
   * @this {XCUITestDriver}
   */
  async setUrl(url) {
    this.log.debug(`Attempting to set url '${url}'`);

    if (this.isWebContext()) {
      this.setCurrentUrl(url);
      // make sure to clear out any leftover web frames
      this.curWebFrames = [];
      await (/** @type {import('appium-remote-debugger').RemoteDebugger} */ (this.remote)).navToUrl(url);
      return;
    }

    if (this.isRealDevice()) {
      await this.proxyCommand('/url', 'POST', {url});
    } else {
      await /** @type {import('../driver').Simulator} */ (this.device).simctl.openUrl(url);
    }
  },
  /**
   * Retrieves the viewport dimensions.
   *
   * The viewport is the device's screen size with status bar size subtracted if the latter is present/visible.
   * @returns {Promise<import('./types').Viewport>}
   * @this {XCUITestDriver}
   */
  async getViewportRect() {
    const scale = await this.getDevicePixelRatio();
    // status bar height comes in unscaled, so scale it
    const statusBarHeight = Math.round((await this.getStatusBarHeight()) * scale);
    const windowSize = await this.getWindowSize();

    // ios returns coordinates/dimensions in logical pixels, not device pixels,
    // so scale up to device pixels. status bar height is already scaled.
    return {
      left: 0,
      top: statusBarHeight,
      width: windowSize.width * scale,
      height: windowSize.height * scale - statusBarHeight,
    };
  },

  /**
   * Get information about the screen.
   *
   * @privateRemarks memoized in constructor
   * @this {XCUITestDriver}
   * @returns {Promise<ScreenInfo>}
   */
  async getScreenInfo() {
    return /** @type {ScreenInfo} */ (await this.proxyCommand('/wda/screen', 'GET'));
  },
  /**
   * @this {XCUITestDriver}
   */
  async getStatusBarHeight() {
    const {statusBarSize} = await this.getScreenInfo();
    return statusBarSize.height;
  },

  /**
   * memoized in constructor
   * @this {XCUITestDriver}
   */
  async getDevicePixelRatio() {
    const {scale} = await this.getScreenInfo();
    return scale;
  },

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
   * @param {import('./types').ButtonName} name - The name of the button to be pressed.
   * @param {number} [durationSeconds] - The duration of the button press in seconds (float).
   * @this {XCUITestDriver}
   */
  async mobilePressButton(name, durationSeconds) {
    if (!name) {
      throw new errors.InvalidArgumentError('Button name is mandatory');
    }
    if (!_.isNil(durationSeconds) && !_.isNumber(durationSeconds)) {
      throw new errors.InvalidArgumentError('durationSeconds should be a number');
    }
    return await this.proxyCommand('/wda/pressButton', 'POST', {name, duration: durationSeconds});
  },
  /**
   * Process a string as speech and send it to Siri.
   *
   * Presents the Siri UI, if it is not currently active, and accepts a string which is then processed as if it were recognized speech. See [the documentation of `activateWithVoiceRecognitionText`](https://developer.apple.com/documentation/xctest/xcuisiriservice/2852140-activatewithvoicerecognitiontext?language=objc) for more details.

   * @param {string} text - Text to be sent to Siri
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async mobileSiriCommand(text) {
    if (!text) {
      throw new errors.InvalidArgumentError('"text" argument is mandatory');
    }
    await this.proxyCommand('/wda/siri/activate', 'POST', {text});
  },
};

const helpers = {
  /**
   * @this {XCUITestDriver}
   */
  async getWindowSizeWeb() {
    const script = 'return {width: window.innerWidth, height: window.innerHeight}';
    return await this.executeAtom('execute_script', [script]);
  },
  /**
   * @this {XCUITestDriver}
   */
  async getWindowSizeNative() {
    return await this.proxyCommand(`/window/size`, 'GET');
  },
};

export default {...helpers, ...commands};

/**
 * @typedef {Object} PressButtonOptions
 * @property {string} name - The name of the button to be pressed.
 * @property {number} [durationSeconds] - Duration in float seconds.
 */

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('./types').ScreenInfo} ScreenInfo
 */
