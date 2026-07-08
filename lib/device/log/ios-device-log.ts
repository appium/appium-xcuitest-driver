import type {AppiumLogger} from '@appium/types';
import {services} from 'appium-ios-device';
import type {SyslogService} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from '../remote-xpc';
import {LineConsumingLog} from './line-consuming-log';

export interface IOSDeviceLogOpts {
  udid: string;
  showLogs?: boolean;
  log: AppiumLogger;
  remoteXPCFacade?: RemoteXPCFacade | null;
}

export class IOSDeviceLog extends LineConsumingLog {
  private readonly udid: string;
  private readonly showLogs: boolean;
  private readonly remoteXPCFacade: RemoteXPCFacade | null;
  // Legacy service (appium-ios-device)
  private legacyService: any | null = null;
  // RemoteXPC syslog service
  private syslogService: SyslogService | null = null;

  constructor(opts: IOSDeviceLogOpts) {
    super({log: opts.log});
    this.udid = opts.udid;
    this.showLogs = !!opts.showLogs;
    this.remoteXPCFacade = opts.remoteXPCFacade ?? null;
  }

  override get isCapturing(): boolean {
    return !!this.syslogService || !!this.legacyService;
  }

  override async startCapture(): Promise<void> {
    if (this.isCapturing) {
      return;
    }

    const facade = this.remoteXPCFacade;
    if (facade && (await facade.determineAvailability())) {
      const started = await facade.attemptService('syslog', async (Services) => {
        const {syslogService, serviceDescriptor} = await Services.startSyslogTextService(this.udid);
        this.syslogService = syslogService;
        syslogService.on('message', this.onLog.bind(this));
        syslogService.on('error', (err: Error) => {
          this.log.warn(`Syslog RemoteXPC error: ${err.message}`);
        });
        await syslogService.start(serviceDescriptor, {pid: -1, textMode: true});
        return true;
      });
      if (started) {
        this.log.info('Starting RemoteXPC syslog capture');
        return;
      }
      await this.stopRemoteXPCCapture();
    }

    await this.startLegacyCapture();
  }

  override async stopCapture(): Promise<void> {
    await this.stopRemoteXPCCapture();
    await this.stopLegacyCapture();
  }

  private async startLegacyCapture(): Promise<void> {
    this.legacyService = await services.startSyslogService(this.udid);
    this.legacyService.start(this.onLog.bind(this));
  }

  private async stopLegacyCapture(): Promise<void> {
    if (!this.legacyService) {
      return;
    }
    this.legacyService.close();
    this.legacyService = null;
  }

  private async stopRemoteXPCCapture(): Promise<void> {
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
