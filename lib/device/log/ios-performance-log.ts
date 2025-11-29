import _ from 'lodash';
import type { AppiumLogger } from '@appium/types';
import { MAX_JSON_LOG_LENGTH, MAX_BUFFERED_EVENTS_COUNT } from './helpers';
import { LineConsumingLog } from './line-consuming-log';

type PerformanceLogEntry = object;
export interface IOSPerformanceLogOptions {
  remoteDebugger: any;
  maxEvents?: number;
  log: AppiumLogger;
}

export class IOSPerformanceLog extends LineConsumingLog {
  private readonly remoteDebugger: any;
  private _started: boolean;

  constructor(opts: IOSPerformanceLogOptions) {
    super({
      maxBufferSize: opts.maxEvents ?? MAX_BUFFERED_EVENTS_COUNT,
      log: opts.log,
    });
    this.remoteDebugger = opts.remoteDebugger;
    this._started = false;
  }

  override async startCapture(): Promise<void> {
    this.log.debug('Starting performance (Timeline) log capture');
    this._clearEntries();
    await this.remoteDebugger.startTimeline(this.onTimelineEvent.bind(this));
    this._started = true;
  }

  override async stopCapture(): Promise<void> {
    this.log.debug('Stopping performance (Timeline) log capture');
    await this.remoteDebugger.stopTimeline();
    this._started = false;
  }

  override get isCapturing(): boolean {
    return this._started;
  }

  private onTimelineEvent(event: PerformanceLogEntry): void {
    const serializedEntry = JSON.stringify(event);
    this.broadcast(serializedEntry);
    this.log.debug(`Received Timeline event: ${_.truncate(serializedEntry, {length: MAX_JSON_LOG_LENGTH})}`);
  }
}

export default IOSPerformanceLog;
