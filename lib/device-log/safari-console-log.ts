import _ from 'lodash';
import { LineConsumingLog } from './line-consuming-log';
import type { AppiumLogger } from '@appium/types';

export interface SafariConsoleLogOptions {
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

export class SafariConsoleLog extends LineConsumingLog {
  constructor(opts: SafariConsoleLogOptions) {
    super({log: opts.log});
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
  addLogLine(err: Error | null, entry: SafariConsoleEntry): void {
    const serializedEntry = JSON.stringify(entry);
    this.broadcast(serializedEntry);
    this.log.info(`[SafariConsole] ${_.truncate(serializedEntry)}`);
  }
}

export default SafariConsoleLog;
