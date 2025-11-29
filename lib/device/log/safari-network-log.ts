import _ from 'lodash';
import { LineConsumingLog } from './line-consuming-log';
import { MAX_JSON_LOG_LENGTH, MAX_BUFFERED_EVENTS_COUNT } from './helpers';
import type { AppiumLogger, StringRecord } from '@appium/types';

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
  showLogs: boolean;
  log: AppiumLogger;
}

export interface SafariNetworkResponseTiming {
  startTime: number;
  redirectStart: number;
  redirectEnd: number;
  fetchStart: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
}

export interface SafariNetworkResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  mimeType: string;
  timing: SafariNetworkResponseTiming;
  source: string;
  security: StringRecord
}

export interface SafariNetworkLogEntryMetrics {
  requestHeaderBytesSent: number;
  requestBodyBytesSent: number;
  responseHeaderBytesReceived: number;
  isProxyConnection: boolean;
  responseBodyBytesReceived: number;
  responseBodyDecodedSize: number;
  securityConnection: StringRecord;
}

export interface SafariNetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  rereferrerPolicy: string;
}

export interface SafariNetworkRequestInitiator {
  type: string;
}

export interface SafariNetworkLogEntry {
  requestId: string;
  frameId?: string;
  loaderId?: string;
  documentURL?: string;
  request?: SafariNetworkRequest
  timestamp?: number;
  walltime?: number;
  inititator?: SafariNetworkRequestInitiator;
  response?: SafariNetworkResponse;
  type?: string;
  initiator?: string;
  // Safari has a `metrics` object on it's `Network.loadingFinished` event
  metrics?: SafariNetworkLogEntryMetrics;
  errorText?: string;
  // When a network call is cancelled, Safari returns `cancelled` as error text
  // but has a boolean `canceled`.
  canceled?: boolean;
  [key: string]: any; // Allow additional properties
}

export class SafariNetworkLog extends LineConsumingLog {
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

  onNetworkEvent(err?: Error, entry?: SafariNetworkLogEntry, method?: string): void {
    if (!_.includes(MONITORED_EVENTS, method)) {
      this.log.debug(`[SafariNetwork] Ignoring unmonitored event: ${method}`);
      return;
    }

    const serializedEntry = JSON.stringify({method, event: entry});
    this.broadcast(serializedEntry);
    if (this._showLogs && _.includes(EVENTS_TO_LOG, method)) {
      this.log.info(`[SafariNetwork] ${_.truncate(serializedEntry, {length: MAX_JSON_LOG_LENGTH})}`);
    }
  }
}

export default SafariNetworkLog;
