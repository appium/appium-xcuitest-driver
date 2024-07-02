import type { LogEntry } from '../commands/types';

export const DEFAULT_LOG_LEVEL = 'ALL';

export function toLogEntry(message: string, timestamp: number, level: string = DEFAULT_LOG_LEVEL): LogEntry {
  return {
    timestamp,
    level,
    message,
  };
}
