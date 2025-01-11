import type { LogEntryAddedEvent, ContextUpdatedEvent, BiDiLogLevel } from './types';
import { NATIVE_WIN } from '../../utils';
import { CONTEXT_UPDATED_EVENT, CONTEXT_UPDATED_EVENT_OBSOLETE, LOG_ENTRY_ADDED_EVENT } from './constants';
import type { LogEntry } from '../types';
import _ from 'lodash';

function toContextUpdatedEvent(method: string, contextName: string): ContextUpdatedEvent {
  return {
    method,
    params: {
      name: contextName,
      type: contextName === NATIVE_WIN ? 'NATIVE' : 'WEB',
    },
  };
}

export const makeContextUpdatedEvent = (contextName: string) => toContextUpdatedEvent(
  CONTEXT_UPDATED_EVENT, contextName
);

/**
 * @deprecated Use {@link makeContextUpdatedEvent} instead
 */
export const makeObsoleteContextUpdatedEvent = (contextName: string) => toContextUpdatedEvent(
  CONTEXT_UPDATED_EVENT_OBSOLETE, contextName
);

export function makeLogEntryAddedEvent(entry: LogEntry, context: string, type: string): LogEntryAddedEvent {
  return {
    context,
    method: LOG_ENTRY_ADDED_EVENT,
    params: {
      type,
      level: adjustLogLevel(entry.level),
      source: {
        realm: '',
      },
      text: entry.message,
      timestamp: entry.timestamp,
    },
  };
}

function adjustLogLevel(originalLevel: string): BiDiLogLevel {
  const originalLevelLc = _.toLower(originalLevel);
  switch (originalLevelLc) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return originalLevelLc as BiDiLogLevel;
    default:
      return 'info';
  }
}
