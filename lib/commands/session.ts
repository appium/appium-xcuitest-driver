import _ from 'lodash';
import type {XCUITestDriver, XCUITestDriverOpts} from '../driver';

/**
 * Stops and removes all web socket handlers that are listening
 * in scope of the current session.
 */
export async function removeAllSessionWebSocketHandlers(this: XCUITestDriver): Promise<void> {
  if (!this.sessionId || !_.isFunction(this.server?.getWebSocketHandlers)) {
    return;
  }

  const activeHandlers = await this.server.getWebSocketHandlers(this.sessionId);
  for (const pathname of _.keys(activeHandlers)) {
    await this.server.removeWebSocketHandler(pathname);
  }
}

/** Whether the initial Safari URL should be pushed at session start. */
export function shouldSetInitialSafariUrl(opts: XCUITestDriverOpts): boolean {
  return (
    !(opts.safariInitialUrl === '' || (opts.noReset && _.isNil(opts.safariInitialUrl))) &&
    !opts.initialDeeplinkUrl
  );
}
