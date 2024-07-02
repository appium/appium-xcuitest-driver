import type { LogEntry } from '../commands/types';

export const DEFAULT_LOG_LEVEL = 'ALL';
export const MAX_JSON_LOG_LENGTH = 200;
export const MAX_BUFFERED_EVENTS_COUNT = 5000;

export function toLogEntry(message: string, timestamp: number, level: string = DEFAULT_LOG_LEVEL): LogEntry {
  return {
    timestamp,
    level,
    message,
  };
}
