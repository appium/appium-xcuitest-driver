import _ from 'lodash';
import {util} from 'appium/support';
import type {XCUITestDriver} from '../driver';
import type {Style} from './types';
import type {Simulator} from 'appium-ios-simulator';

/**
 * Set the device's UI appearance style
 *
 * @since iOS 12.0
 * @param style - The appearance style to set
 * @throws If the current platform does not support UI appearance changes
 */
export async function mobileSetAppearance(
  this: XCUITestDriver,
  style: 'dark' | 'light',
): Promise<void> {
  if (!['light', 'dark'].includes(_.toLower(style))) {
    throw new Error(`The 'style' value is expected to equal either 'light' or 'dark'`);
  }
  if (util.compareVersions(this.opts.platformVersion as string, '<', '12.0')) {
    throw new Error('Changing appearance is only supported since iOS 12');
  }

  if (this.isSimulator()) {
    try {
      await (this.device as Simulator).setAppearance(style);
      return;
    } catch (e: any) {
      this.log.debug(e.stack);
    }
  }
  try {
    await this.proxyCommand('/wda/device/appearance', 'POST', {name: style}, false);
    return;
  } catch (e: any) {
    this.log.debug(e.stack);
  }
  // Fall back to the ugly Siri workaround if the current SDK is too old
  await this.mobileSiriCommand(`Turn ${_.toLower(style) === 'dark' ? 'on' : 'off'} dark mode`);
}

/**
 * Get the device's UI appearance style.
 *
 * @since Xcode SDK 11
 * @returns The current appearance style
 */
export async function mobileGetAppearance(
  this: XCUITestDriver,
): Promise<{style: Style}> {
  if (util.compareVersions(this.opts.platformVersion as string, '<', '12.0')) {
    return {style: 'unsupported'};
  }

  let style: Style | undefined;
  if (this.isSimulator()) {
    try {
      style = await (this.device as Simulator).getAppearance() as Style;
    } catch {}
  }
  if (!style) {
    const deviceInfo = await this.proxyCommand<any, {userInterfaceStyle?: string}>('/wda/device/info', 'GET');
    style = (deviceInfo?.userInterfaceStyle ?? 'unknown') as Style;
  }
  return {
    style: style as Style,
  };
}

