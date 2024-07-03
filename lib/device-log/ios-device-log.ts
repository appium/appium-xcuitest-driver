import {services} from 'appium-ios-device';
import { LineConsumingLog } from './line-consuming-log';
import type { AppiumLogger } from '@appium/types';

export interface IOSDeviceLogOpts {
  udid: string;
  showLogs?: boolean;
  log: AppiumLogger;
}

export class IOSDeviceLog extends LineConsumingLog {
  private readonly udid: string;
  private readonly showLogs: boolean;
  private service: any | null;

  constructor(opts: IOSDeviceLogOpts) {
    super({log: opts.log});
    this.udid = opts.udid;
    this.showLogs = !!opts.showLogs;
    this.service = null;
  }

  override async startCapture(): Promise<void> {
    if (this.service) {
      return;
    }
    this.service = await services.startSyslogService(this.udid);
    this.service.start(this.onLog.bind(this));
  }

  override get isCapturing(): boolean {
    return !!this.service;
  }

  // eslint-disable-next-line require-await
  override async stopCapture(): Promise<void> {
    if (!this.service) {
      return;
    }
    this.service.close();
    this.service = null;
  }

  private onLog(logLine: string): void {
    this.broadcast(logLine);
    if (this.showLogs) {
      this.log.info(`[IOS_SYSLOG_ROW] ${logLine}`);
    }
  }
}

export default IOSDeviceLog;
