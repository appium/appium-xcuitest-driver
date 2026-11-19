import type {XCUITestDriver} from '../../driver.js';
import {NATIVE_WIN, WEBVIEW_BASE} from '../constants.js';

/**
 * Checks whether any BiDi client is subscribed to the event or to its whole module.
 *
 * @param driver - The driver instance
 * @param method - Fully qualified event name, e.g. `log.entryAdded`
 * @param context - If set, only subscriptions that cover this context (or all contexts) count
 */
export function hasSubscribers(driver: XCUITestDriver, method: string, context?: string): boolean {
  const moduleName = method.split('.')[0];
  return [method, moduleName].some((e) => {
    const contexts = driver.bidiEventSubs[e];
    return Boolean(contexts?.length) && (context === undefined || contexts.includes('') || contexts.includes(context));
  });
}

/** Returns the public name of the current context, e.g. `NATIVE_APP` or `WEBVIEW_5191.1`. */
export function getCurrentContextName(driver: XCUITestDriver): string {
  return driver.curContext && driver.curContext !== NATIVE_WIN ? `${WEBVIEW_BASE}${driver.curContext}` : NATIVE_WIN;
}

/** Returns the name of the webview that owns the Safari log streams, or `NATIVE_APP` if none was selected yet. */
export function getLogWebviewContextName(driver: XCUITestDriver): string {
  return driver._lastWebviewContext ? `${WEBVIEW_BASE}${driver._lastWebviewContext}` : NATIVE_WIN;
}
