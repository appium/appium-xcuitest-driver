import type { LogEntryAddedEvent, ContextUpdatedEvent } from './types';
import { NATIVE_WIN } from '../../utils';
import { CONTEXT_UPDATED_EVENT, LOG_ENTRY_ADDED_EVENT } from './constants';
import type { LogEntry } from '../types';

export function makeContextUpdatedEvent(contextName: string): ContextUpdatedEvent {
  return {
    method: CONTEXT_UPDATED_EVENT,
    params: {
      name: contextName,
      type: contextName === NATIVE_WIN ? 'NATIVE' : 'WEB',
    },
  };
}

export function makeLogEntryAddedEvent(entry: LogEntry, context: string, type: string): LogEntryAddedEvent {
  return {
    context,
    method: LOG_ENTRY_ADDED_EVENT,
    params: {
      type,
      level: entry.level,
      source: {
        realm: '',
      },
      text: entry.message,
      timestamp: entry.timestamp,
    },
  };
}
