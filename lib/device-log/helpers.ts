import type { LogEntry } from '../commands/types';
import { fs } from 'appium/support';
import { createInterface } from 'node:readline';
import _ from 'lodash';

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

export interface GrepOptions {
  caseInsensitive?: boolean;
}

export async function grepFile(
  fullPath: string,
  str: string,
  opts: GrepOptions = {}
): Promise<boolean> {
  const input = fs.createReadStream(fullPath);
  const rl = createInterface({input});
  return await new Promise((resolve, reject) => {
    input.once('error', reject);
    rl.on('line', (line) => {
      if (opts.caseInsensitive && _.toLower(line).includes(_.toLower(str))
          || !opts.caseInsensitive && line.includes(str)) {
        resolve(true);
        input.close();
      }
    });
    input.once('end', () => resolve(false));
  });
}
