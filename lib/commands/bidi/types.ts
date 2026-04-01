interface BiDiEvent<TParams> {
  method: string;
  params: TParams;
}

interface LogEntrySource {
  realm: string;
  context?: string;
}

export type BiDiLogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntryAddedEventParams {
  type: string;
  level: BiDiLogLevel;
  source: LogEntrySource;
  text: string;
  timestamp: number;
}

// https://w3c.github.io/webdriver-bidi/#event-log-entryAdded
export interface LogEntryAddedEvent extends BiDiEvent<LogEntryAddedEventParams> {
  context: string;
}

interface ContentUpdatedParams {
  name: string;
  type: 'NATIVE' | 'WEB';
}

// https://github.com/appium/appium/issues/20741
export interface ContextUpdatedEvent extends BiDiEvent<ContentUpdatedParams> {}

export interface NetworkMonitorEventParams {
  /** DVT networking instrument payload (interface / connection detection / connection update). */
  event: Record<string, unknown>;
}

/**
 * BiDi event emitted for each DVT NetworkMonitor sample while `mobile: startNetworkMonitor` is active.
 *
 * @see https://github.com/appium/appium-ios-remotexpc
 */
export interface NetworkMonitorBiDiEvent extends BiDiEvent<NetworkMonitorEventParams> {
  context: string;
}
