import type {Element} from '@appium/types';
import {errors} from 'appium/driver.js';

import type {XCUITestDriver} from '../driver.js';
import {WDA_CLASS_CHAIN_STRATEGY} from '../css/index.js';
import {isTvOs, withoutImplicitWait} from '../utils/index.js';
import {getDuoSimulator} from './helpers/duo.js';

// Observed UIKit identifier in Duo's vertical toolbar; not a public API contract.
const DUO_SYSTEM_BACK_BUTTON_IDENTIFIER = 'BackButton';

declare module '../driver.js' {
  interface XCUITestDriver {
    back(...args: Parameters<typeof back>): ReturnType<typeof back>;
    forward(...args: Parameters<typeof forward>): ReturnType<typeof forward>;
    nativeBack(...args: Parameters<typeof nativeBack>): ReturnType<typeof nativeBack>;
    mobileDeepLink(...args: Parameters<typeof mobileDeepLink>): ReturnType<typeof mobileDeepLink>;
  }
}

/**
 * Navigate back in the browser history or native app navigation.
 */
export async function back(this: XCUITestDriver): Promise<void> {
  if (!this.isWebContext()) {
    await this.nativeBack();
    return;
  }
  await this._webExecutionBackend.back();
}

/**
 * Navigate forward in the browser history.
 */
export async function forward(this: XCUITestDriver): Promise<void> {
  if (!this.isWebContext()) {
    // No-op for native context
    return;
  }
  await this._webExecutionBackend.forward();
}

/**
 * Opens the given URL with the default application assigned to handle it based on the URL
 * scheme, or the application provided as an optional parameter
 *
 * (Note: the version of Xcode must be 14.3+ and iOS must be 16.4+)
 *
 * @param url - the URL to be opened, e.g. `myscheme://yolo`
 * @param bundleId - the application to open the given URL with. If not provided, then
 * the application assigned by the operating system to handle URLs of the appropriate type
 * @since 4.17
 */
export async function mobileDeepLink(this: XCUITestDriver, url: string, bundleId?: string): Promise<void> {
  return await this.proxyCommand('/url', 'POST', {
    url,
    bundleId,
  });
}

/**
 * Navigate back in native app navigation by finding and clicking the back button.
 */
export async function nativeBack(this: XCUITestDriver): Promise<void> {
  if (isTvOs(this.opts.platformName)) {
    this.log.debug(`Sending Menu button as back behavior in tvOS`);
    return await this.mobilePressButton('Menu');
  }

  const isDuoSimulator = Boolean(await getDuoSimulator(this));
  try {
    if (isDuoSimulator) {
      // Probe once without changing the implicit wait or swallowing WDA errors.
      const toolbarBackButtons = (await this.proxyCommand('/elements', 'POST', {
        using: WDA_CLASS_CHAIN_STRATEGY,
        value: `**/XCUIElementTypeToolbar/**/XCUIElementTypeButton[\`name == "${DUO_SYSTEM_BACK_BUTTON_IDENTIFIER}" AND visible == 1 AND enabled == 1\`]`,
      })) as Element<string>[];
      if (toolbarBackButtons.length > 1) {
        throw new errors.InvalidElementStateError('Multiple actionable system Back buttons found in Duo toolbars');
      }
      if (toolbarBackButtons.length === 1) {
        await this.nativeClick(toolbarBackButtons[0]);
        return;
      }
    }
    const navBar = await this.findNativeElementOrElements('class name', 'XCUIElementTypeNavigationBar', false);
    let dstButton: Element<string>;
    const backButtons = await withoutImplicitWait(this, () =>
      this.findNativeElementOrElements(
        '-ios predicate string',
        'type == "XCUIElementTypeButton" AND label == "Back"',
        true,
        navBar,
      ),
    );
    if (isDuoSimulator && backButtons.length !== 1) {
      if (backButtons.length > 1) {
        throw new errors.InvalidElementStateError('Multiple Back buttons found in the navigation bar');
      }
      throw new errors.NoSuchElementError('No system toolbar Back button or navigation bar Back button found');
    }
    if (backButtons.length === 0) {
      const buttons = await this.findNativeElementOrElements(
        '-ios predicate string',
        'type == "XCUIElementTypeButton"',
        true,
        navBar,
      );
      if (buttons.length === 0) {
        throw new Error('No buttons found in navigation bar');
      }
      this.log.debug(`Did not find any navigation bar 'back' button. Clicking the first one.`);
      dstButton = buttons[0];
    } else {
      this.log.debug(`Found navigation bar 'back' button. Clicking.`);
      dstButton = backButtons[0];
    }

    await this.nativeClick(dstButton);
  } catch (err: any) {
    if (isDuoSimulator) {
      throw err;
    }
    this.log.error(`Unable to find navigation bar and back button: ${err.message}`);
  }
}
