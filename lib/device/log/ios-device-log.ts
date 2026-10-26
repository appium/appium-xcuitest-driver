import type {AppiumLogger} from '@appium/types';
import type {SyslogService} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from '../remote-xpc/index.js';
import {LineConsumingLog} from './line-consuming-log.js';

export interface IOSDeviceLogOpts {
  udid: string;
  showLogs?: boolean;
  log: AppiumLogger;
  remoteXPCFacade: RemoteXPCFacade;
}

export class IOSDeviceLog extends LineConsumingLog {
  private readonly udid: string;
  private readonly showLogs: boolean;
  private readonly remoteXPCFacade: RemoteXPCFacade;
  private syslogService: SyslogService | null = null;

  constructor(opts: IOSDeviceLogOpts) {
    super({log: opts.log});
    this.udid = opts.udid;
    this.showLogs = !!opts.showLogs;
    this.remoteXPCFacade = opts.remoteXPCFacade;
  }

  override get isCapturing(): boolean {
    return !!this.syslogService;
  }

  override async startCapture(): Promise<void> {
    if (this.isCapturing) {
      return;
    }

    try {
      await this.remoteXPCFacade.requireService('syslog', async (Services, options) => {
        const {syslogService, serviceDescriptor} = await Services.startSyslogTextService(this.udid, options);
        this.syslogService = syslogService;
        syslogService.on('message', this.onLog.bind(this));
        syslogService.on('error', (err: Error) => {
          this.log.warn(`Syslog RemoteXPC error: ${err.message}`);
        });
        await syslogService.start(serviceDescriptor, {pid: -1, textMode: true});
      });
    } catch (err) {
      await this.stopCapture();
      throw err;
    }
    this.log.info('Starting RemoteXPC syslog capture');
  }

  override async stopCapture(): Promise<void> {
    if (!this.syslogService) {
      return;
    }
    try {
      await this.syslogService.stop();
    } catch {}
    this.syslogService = null;
  }

  private onLog(logLine: string): void {
    this.broadcast(logLine);
    if (this.showLogs) {
      this.log.info(`[IOS_SYSLOG_ROW] ${logLine}`);
    }
  }
}

export default IOSDeviceLog;
