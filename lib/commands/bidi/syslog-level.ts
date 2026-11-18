import {toLogEntry} from '../../device/log/helpers.js';
import type {LogEntry} from '../types.js';

// Simulator `log stream --style compact` line: `<date> <time> <type> process[pid:tid] ...`
const SIMULATOR_TYPE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\s+(Db|Df|I|E|F)\s/;
// Real device syslog relay line: `<Mon> <day> <time> <host> process(lib)[pid] <Level>: ...`
const DEVICE_LEVEL_PATTERN = /^\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\S+\s+[^<]*?\[\d+\]\s+<(\w+)>:/;

const SIMULATOR_LEVELS: Readonly<Record<string, string>> = {
  Db: 'debug',
  Df: 'info',
  I: 'info',
  E: 'error',
  F: 'error',
};
const DEVICE_LEVELS: Readonly<Record<string, string>> = {
  Debug: 'debug',
  Info: 'info',
  Notice: 'info',
  Warning: 'warn',
  Error: 'error',
  Critical: 'error',
  Alert: 'error',
  Emergency: 'error',
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
    const level = levels[pattern.exec(entry.message)?.[1] ?? ''];
    return level ? toLogEntry(entry.message, entry.timestamp, level) : entry;
  };
}
