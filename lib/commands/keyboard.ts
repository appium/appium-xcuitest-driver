import _ from 'lodash';
import type {XCUITestDriver} from '../driver';
import type {KeyboardKey} from './types';

/**
 * Hides the keyboard.
 *
 * @deprecated
 */
export async function hideKeyboard(
  this: XCUITestDriver,
  strategy: any,
  ...possibleKeys: any[]
): Promise<boolean> {
  // last parameter is the session id
  const keyNames = _.compact(possibleKeys.slice(0, -1)).map((x) => `${x}`);
  await this.mobileHideKeyboard(keyNames);
  return true;
}

/**
 * Hides the keyboard using the specified key names.
 *
 * @param keys - Array of key names to use for dismissing the keyboard
 */
export async function mobileHideKeyboard(
  this: XCUITestDriver,
  keys: string[] = [],
): Promise<void> {
  if (!keys.includes('done')) {
    keys.push('done');
  }
  await this.proxyCommand('/wda/keyboard/dismiss', 'POST', {keyNames: keys});
}

/**
 * Checks whether the keyboard is currently shown.
 *
 * @returns `true` if the keyboard is shown, `false` otherwise
 */
export async function isKeyboardShown(this: XCUITestDriver): Promise<boolean> {
  try {
    await this.findNativeElementOrElements('class name', 'XCUIElementTypeKeyboard', false);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send keys to the given element or to the application under test.
 * This API is not supported on tvOS
 *
 * @since Xcode 15/iOS 17
 * @param keys - Array of keys to type.
 * Each item could either be a string, that represents a key itself (see
 * https://developer.apple.com/documentation/xctest/xcuielement/1500604-typekey?language=objc
 * and https://developer.apple.com/documentation/xctest/xcuikeyboardkey?language=objc)
 * or a dictionary, if the key should also be entered with modifiers.
 * @param elementId - UUID of the element to send keys to.
 * If the element is not provided then the keys will be sent to the current application.
 */
export async function mobileKeys(
  this: XCUITestDriver,
  keys: (KeyboardKey | string)[],
  elementId: string | null = null,
): Promise<void> {
  const url = `/wda/element/${elementId || 0}/keyboardInput`;
  await this.proxyCommand(url, 'POST', { keys });
}

