import type { LogEntry } from '../commands/types';

export function toLogEntry(message: string, timestamp: number): LogEntry {
  return {
    timestamp,
    level: 'ALL',
    message,
  };
}
