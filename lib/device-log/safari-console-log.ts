import _ from 'lodash';
import type { AppiumLogger } from '@appium/types';
import {
  toLogEntry,
  DEFAULT_LOG_LEVEL,
  MAX_JSON_LOG_LENGTH,
  MAX_BUFFERED_EVENTS_COUNT
} from './helpers';
import IOSLog from './ios-log';
import type { LogEntry } from '../commands/types';

const LOG_LEVELS_MAP = {
  error: 'SEVERE',
  warning: 'WARNING',
  log: 'FINE',
};

export interface SafariConsoleLogOptions {
  showLogs: boolean;
  log: AppiumLogger;
}

export interface SafariConsoleStacktraceEntry {
  functionName: string;
  url: string;
  scriptId: number;
  lineNumber: number;
  columnNumber: number;
}

export interface SafariConsoleEntry {
  source: string;
  level: string;
  text: string;
  type: string;
  line: number;
  column: number;
  url?: string;
  repeatCount: number;
  stackTrace: SafariConsoleStacktraceEntry[];
}

type TSerializedEntry = [SafariConsoleEntry, number];

export class SafariConsoleLog extends IOSLog<SafariConsoleEntry, TSerializedEntry> {
  private readonly _showLogs: boolean;

  constructor(opts: SafariConsoleLogOptions) {
    super({
      log: opts.log,
      maxBufferSize: MAX_BUFFERED_EVENTS_COUNT,
    });
    this._showLogs = opts.showLogs;
  }

  override async startCapture(): Promise<void> {}
  override async stopCapture(): Promise<void> {}
  override get isCapturing(): boolean {
    return true;
  }

  /**
   *
   * @param err
   * @param entry The output will be like:
   *   {
   *     "source": "javascript",
   *     "level":"error",
   *     "text":"ReferenceError: Can't find variable: s_account",
   *     "type":"log",
   *     "line":2,
   *     "column":21,
   *     "url":"https://assets.adobedtm.com/b46e318d845250834eda10c5a20827c045a4d76f/scripts/satellite-57866f8b64746d53a8000104-staging.js",
   *     "repeatCount":1,
   *     "stackTrace":[{
   *       "functionName":"global code",
   *       "url":"https://assets.adobedtm.com/b46e318d845250834eda10c5a20827c045a4d76f/scripts/satellite-57866f8b64746d53a8000104-staging.js",
   *       "scriptId":"6",
   *       "lineNumber":2,
   *       "columnNumber":21
   *     }]
   *  }
   *
   * we need, at least, `level` (in accordance with Java levels
   * (https://docs.oracle.com/javase/7/docs/api/java/util/logging/Level.html)),
   * `timestamp`, and `message` to satisfy the java client. In order to
   * provide all the information to the client, `message` is the full
   * object, stringified.
   *
   */
  onConsoleLogEvent(err: object | null, entry: SafariConsoleEntry): void {
    this.broadcast(entry);
    if (this._showLogs) {
      this.log.info(`[SafariConsole] ${_.truncate(JSON.stringify(entry), {length: MAX_JSON_LOG_LENGTH})}`);
    }
  }

  protected override _serializeEntry(value: SafariConsoleEntry): TSerializedEntry {
    return [value, Date.now()];
  }

  protected override _deserializeEntry(value: TSerializedEntry): LogEntry {
    const [entry, timestamp] = value;
    return toLogEntry(JSON.stringify(entry), timestamp, mapLogLevel(entry.level));
  }
}

function mapLogLevel(originalLevel: string): string {
  return LOG_LEVELS_MAP[originalLevel] ?? DEFAULT_LOG_LEVEL;
}

export default SafariConsoleLog;
