import type {XCUITestDriver} from '../driver.js';
import {WEBVIEW_BASE} from './context.js';
import {requireSimulator, requireWebContext} from './helpers/index.js';

/**
 * Starts a WebKit `Automation`-domain session against the current Safari web view. From this
 * point on, web-execution commands route through the automation session instead of atoms, until
 * `mobile: stopAutomationSession` is called.
 *
 * Simulator only for now - on a real device, starting a session has been observed to kill WDA
 * (no recovery) and to break restoring the previous context on stop.
 *
 * Seeded with the driver's current page-load/script/implicit-wait timeouts - the session's own
 * defaults (in particular a `0` implicit wait) otherwise differ from what the client configured,
 * silently changing WebDriver timeout behavior on session start. Later timeout updates are kept
 * in sync too, by {@linkcode setPageLoadTimeout}/{@linkcode setAsyncScriptTimeout}/
 * {@linkcode setImplicitWait}.
 *
 * @group Mobile Web Only
 * @throws {errors.NotImplementedError} If not in a web context
 * @throws {Error} If not running on a Simulator
 */
export async function mobileStartAutomationSession(this: XCUITestDriver): Promise<void> {
  requireWebContext(this, 'Starting an automation session');
  requireSimulator(this, 'Starting an automation session');
  this._preAutomationSessionContext = this.curContext;
  const session = await this.remote.startAutomationSession();
  if (this.pageLoadMs != null) {
    session.pageLoadTimeoutMs = this.pageLoadMs;
  }
  if (this.asyncWaitMs != null) {
    session.scriptTimeoutMs = this.asyncWaitMs;
  }
  if (this.implicitWaitMs != null) {
    session.implicitWaitTimeoutMs = this.implicitWaitMs;
  }
}

/**
 * Stops the active WebKit `Automation`-domain session, if any. A no-op if none is active.
 *
 * The on-device remote-automation grant is scoped to the whole remote debugger connection, not
 * the individual session - the only way to clear it is a full reconnect, which this does.
 *
 * @param closeAllWindows - Close every tab the automation session drove first. On by default -
 *        leaving them open leaks a tab permanently stuck under remote automation control. Can
 *        wedge the connection for minutes (https://bugs.webkit.org/show_bug.cgi?id=322937), so
 *        callers hitting that may pass `false` to accept the leak instead of the wedge risk.
 * @param restorePreviousContext - Switch back to whichever web view was active before `mobile:
 *        startAutomationSession`, if it still exists after the reconnect. On by default.
 */
export async function mobileStopAutomationSession(
  this: XCUITestDriver,
  closeAllWindows: boolean = true,
  restorePreviousContext: boolean = true,
): Promise<void> {
  if (!this._remote?.automationSession?.isStarted) {
    return;
  }
  const previousContext = this._preAutomationSessionContext;
  this._preAutomationSessionContext = null;
  await this.remote.stopAutomationSession({closeAllWindows});
  await this.stopRemote();

  if (!restorePreviousContext || !previousContext) {
    return;
  }
  try {
    // getContextsAndViews() reports webview ids prefixed (`WEBVIEW_<id>`); curContext (and so
    // previousContext, captured from it) is stored unprefixed - normalize before comparing.
    const previousContextId = `${WEBVIEW_BASE}${previousContext}`;
    const stillExists = (await this.getContextsAndViews(false)).some(
      (context) => `${context.id}` === previousContextId,
    );
    if (stillExists) {
      await this.setContext(previousContext);
    }
  } catch (err: any) {
    this.log.info(`Could not switch back to the pre-automation-session context: ${err.message}`);
  }
}
