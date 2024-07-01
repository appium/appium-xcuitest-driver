import _ from 'lodash';
import { LineConsumingLog } from './line-consuming-log';
import type { AppiumLogger } from '@appium/types';

const EVENTS_TO_LOG = [
  'Network.loadingFinished',
  'Network.loadingFailed',
];
const MONITORED_EVENTS = [
  'Network.requestWillBeSent',
  'Network.responseReceived',
  ...EVENTS_TO_LOG,
];

export interface SafariConsoleLogOptions {
  log: AppiumLogger;
}

export interface SafariNetworkResponseTiming {
  responseStart: number;
  receiveHeadersEnd: number;
}

export interface SafariNetworkResponse {
  url: string;
  status: number;
  timing: SafariNetworkResponseTiming;
  source: string;
}

export interface SafariNetworkLogEntryMetrics {
  responseBodyBytesReceived: number;
}

export interface SafariNetworkLogEntry {
  requestId: string;
  response?: SafariNetworkResponse;
  type?: string;
  initiator?: string;
  // Safari has a `metrics` object on it's `Network.loadingFinished` event
  metrics?: SafariNetworkLogEntryMetrics;
  errorText?: string;
  // When a network call is cancelled, Safari returns `cancelled` as error text
  // but has a boolean `canceled`.
  canceled?: boolean;
}

export class SafariNetworkLog extends LineConsumingLog {
  constructor(opts: SafariConsoleLogOptions) {
    super({log: opts.log});
  }

  override async startCapture(): Promise<void> {}
  override async stopCapture(): Promise<void> {}
  override get isCapturing(): boolean {
    return true;
  }

  addLogLine(method: string, entry: SafariNetworkLogEntry): void {
    if (!MONITORED_EVENTS.includes(method)) {
      return;
    }

    const serializedEntry = JSON.stringify(entry);
    this.broadcast(serializedEntry);
    if (EVENTS_TO_LOG.includes(method)) {
      this.log.info(`[SafariNetwork] ${_.truncate(serializedEntry)}`);
    }
  }
}

export default SafariNetworkLog;
