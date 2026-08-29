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
 * Stops the active WebKit `Automation`-domain session, if any, reverting web-execution commands
 * back to atoms-based execution. A no-op if no automation session is currently active.
 */
export async function mobileStopAutomationSession(this: XCUITestDriver): Promise<void> {
  await this.remote.stopAutomationSession();
}
