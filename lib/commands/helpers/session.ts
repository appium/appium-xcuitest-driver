export interface SessionWebSocketHandlerHost {
  sessionId?: string | null;
  server?: {
    getWebSocketHandlers?: (sessionId: string) => Promise<Record<string, unknown>>;
    removeWebSocketHandler: (pathname: string) => Promise<void>;
  } | null;
}

export interface SafariUrlSessionOpts {
  safariInitialUrl?: string | null;
  noReset?: boolean;
  initialDeeplinkUrl?: string | null;
}

/**
 * Stops and removes all web socket handlers that are listening
 * in scope of the current session.
 */
export async function removeAllSessionWebSocketHandlers(this: SessionWebSocketHandlerHost): Promise<void> {
  if (!this.sessionId || typeof this.server?.getWebSocketHandlers !== 'function') {
    return;
  }

  const activeHandlers = await this.server.getWebSocketHandlers(this.sessionId);
  for (const pathname of Object.keys(activeHandlers)) {
    await this.server.removeWebSocketHandler(pathname);
  }
}

/** Whether the initial Safari URL should be pushed at session start. */
export function shouldSetInitialSafariUrl(opts: SafariUrlSessionOpts): boolean {
  return !(opts.safariInitialUrl === '' || (opts.noReset && opts.safariInitialUrl == null)) && !opts.initialDeeplinkUrl;
}
