import type {XCUITestDriver} from '../driver.js';
import {requireWebContext} from './helpers/index.js';

/**
 * Starts a WebKit `Automation`-domain session against the current Safari web view.
 *
 * From this point on, the W3C web-execution commands (navigation, element find/interact,
 * cookies, window/frame management, script execution, screenshots, W3C Actions, JS-dialog
 * handling) route through the automation session's own protocol methods instead of atoms,
 * until `mobile: stopAutomationSession` is called. Switching contexts does not implicitly stop
 * the session - it stays alive until explicitly stopped (or the session/app disconnects).
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 */
export async function mobileStartAutomationSession(this: XCUITestDriver): Promise<void> {
  requireWebContext(this, 'Starting an automation session');
  await this.remote.startAutomationSession();
}

/**
 * Stops the active WebKit `Automation`-domain session, if any. A no-op if no automation session
 * is currently active.
 *
 * WebKit's remote-automation grant - the on-device "Safari is Running Automated Software..."
 * banner - is scoped to the whole remote debugger connection, not to the individual automation
 * session; there is no protocol message that ends just the automation portion of it (see
 * [WebDriver is coming to Safari in iOS 13](https://webkit.org/blog/9395/webdriver-is-coming-to-safari-in-ios-13)
 * for background on this private `Automation` domain). The only way to actually clear it is to
 * close and reopen the whole connection, which this does. Since the session only ever drives
 * tabs it created itself, and those are closed as part of stopping it, there is normally nothing
 * left to resume into anyway - so this always leaves the driver back in `NATIVE_APP` context
 * rather than a (likely nonexistent) web view.
 */
export async function mobileStopAutomationSession(this: XCUITestDriver): Promise<void> {
  if (!this._remote?.automationSession?.isStarted) {
    return;
  }
  await this.remote.stopAutomationSession();
  await this.stopRemote();
}
