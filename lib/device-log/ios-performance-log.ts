import _ from 'lodash';
import { IOSLog } from './ios-log';
import type { LogEntry } from '../commands/types';
import type { AppiumLogger } from '@appium/types';

const MAX_EVENTS = 5000;

type PerformanceLogEntry = object;
export interface IOSPerformanceLogOptions {
  remoteDebugger: any;
  maxEvents?: number;
  log?: AppiumLogger;
}

export class IOSPerformanceLog extends IOSLog<PerformanceLogEntry, PerformanceLogEntry> {
  private remoteDebugger: any;
  private _started: boolean;

  constructor(opts: IOSPerformanceLogOptions) {
    super({
      maxBufferSize: opts.maxEvents ?? MAX_EVENTS,
      log: opts.log,
    });
    this.remoteDebugger = opts.remoteDebugger;
    this._started = false;
  }

  override async startCapture(): Promise<void> {
    this.log.debug('Starting performance (Timeline) log capture');
    this._clearEntries();
    const result = await this.remoteDebugger.startTimeline(this.onTimelineEvent.bind(this));
    this._started = true;
    return result;
  }

  override async stopCapture(): Promise<void> {
    this.log.debug('Stopping performance (Timeline) log capture');
    const result = await this.remoteDebugger.stopTimeline();
    this._started = false;
    return result;
  }

  override get isCapturing(): boolean {
    return this._started;
  }

  protected override _serializeEntry(value: PerformanceLogEntry): PerformanceLogEntry {
    return value;
  }

  protected override _deserializeEntry(value: PerformanceLogEntry): LogEntry {
    return value as LogEntry;
  }

  private onTimelineEvent(event: PerformanceLogEntry): void {
    this.log.debug(`Received Timeline event: ${_.truncate(JSON.stringify(event))}`);
    this.broadcast(event);
  }
}

export default IOSPerformanceLog;
