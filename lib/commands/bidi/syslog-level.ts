import {toLogEntry} from '../../device/log/helpers.js';
import type {LogEntry} from '../types.js';

// Simulator `log stream --style compact` line: `<date> <time> <type> process[pid:tid] ...`
const SIMULATOR_TYPE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\s+(Db|Df|I|E|F)\s/;
// Real device lines: `<Mon> <day> <time> <host> process(lib)[pid] <Level>: ...` (syslog relay) or
// `<date> <time> process{image}[pid] <LEVEL>: ...` (os_trace relay)
const DEVICE_LEVEL_PATTERN =
  /^(?:\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+[^<]*?\[\d+\]\s+<(\w+)>:/;

const SIMULATOR_LEVELS: Readonly<Record<string, string>> = {
  Db: 'debug',
  Df: 'info',
  I: 'info',
  E: 'error',
  F: 'error',
};
const DEVICE_LEVELS: Readonly<Record<string, string>> = {
  debug: 'debug',
  info: 'info',
  notice: 'info',
  user_action: 'info',
  warning: 'warn',
  error: 'error',
  critical: 'error',
  alert: 'error',
  emergency: 'error',
  fault: 'error',
};

/**
 * Builds a transformer that sets the entry level from the severity of the syslog line.
 * Lines without a recognizable severity are returned unchanged.
 *
 * @param isRealDevice - Whether the lines come from a real device (otherwise from a simulator)
 */
export function makeSyslogLevelTransformer(isRealDevice: boolean): (entry: LogEntry) => LogEntry {
  const [pattern, levels] = isRealDevice
    ? [DEVICE_LEVEL_PATTERN, DEVICE_LEVELS]
    : [SIMULATOR_TYPE_PATTERN, SIMULATOR_LEVELS];
  return (entry) => {
    const key = pattern.exec(entry.message)?.[1];
    const level = key && levels[isRealDevice ? key.toLowerCase() : key];
    return level ? toLogEntry(entry.message, entry.timestamp, level) : entry;
  };
}
