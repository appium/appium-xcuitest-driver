import type {
  LogEntryAddedEvent,
  ContextUpdatedEvent,
  BiDiLogLevel,
  NetworkMonitorBiDiEvent,
} from './types';
import {NATIVE_WIN} from '../../utils';
import {CONTEXT_UPDATED_EVENT, LOG_ENTRY_ADDED_EVENT, NETWORK_MONITOR_EVENT} from './constants';
import type {LogEntry} from '../types';
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

export const makeContextUpdatedEvent = (contextName: string) =>
  toContextUpdatedEvent(CONTEXT_UPDATED_EVENT, contextName);

/**
 * Builds a BiDi event for a single DVT NetworkMonitor instrument payload.
 * Clones the payload with `structuredClone` so subscribers get a plain snapshot (safe if anything
 * downstream mutates) without the lossiness of `JSON.stringify` (e.g. `NaN`, `undefined` handling).
 */
export function makeNetworkMonitorEvent(event: object): NetworkMonitorBiDiEvent {
  return {
    context: NATIVE_WIN,
    method: NETWORK_MONITOR_EVENT,
    params: {
      event: structuredClone(event) as Record<string, unknown>,
    },
  };
}

export function makeLogEntryAddedEvent(
  entry: LogEntry,
  context: string,
  type: string,
): LogEntryAddedEvent {
  return {
    context,
    method: LOG_ENTRY_ADDED_EVENT,
    params: {
      type,
      level: adjustLogLevel(entry.level),
      source: {
        realm: '',
        context,
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
