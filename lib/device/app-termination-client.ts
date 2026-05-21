import _ from 'lodash';
import {services, INSTRUMENT_CHANNEL} from 'appium-ios-device';
import type {AppiumLogger} from '@appium/types';
import type {Devicectl} from 'node-devicectl';
import {isIos17OrNewerPlatform, isIos18OrNewerPlatform} from '../utils';
import {InstallationProxyClient} from './installation-proxy-client';
import {getRemoteXPCServices} from './remotexpc-utils';

type TerminateAppResult =
  | {terminated: true; pid: number}
  | {terminated: false; reason: 'not_running' | 'error'; detail?: string};

export class AppTerminationClient {
  constructor(
    private readonly udid: string,
    private readonly platformVersion: string,
    private readonly devicectl: Devicectl,
    private readonly log: AppiumLogger,
  ) {}

  async terminate(bundleId: string): Promise<boolean> {
    let result: TerminateAppResult;
    if (isIos18OrNewerPlatform(this.platformVersion)) {
      try {
        result = await this.terminateRemoteXPC(bundleId);
      } catch (err: any) {
        this.log.warn(`Failed to terminate '${bundleId}' via RemoteXPC: ${err.message}`);
        result = await this.terminateLegacy(bundleId);
      }
    } else {
      result = await this.terminateLegacy(bundleId);
    }

    if (result.terminated) {
      this.log.debug(`Killed process for '${bundleId}' app with PID ${result.pid}`);
      return true;
    }
    switch (result.reason) {
      case 'not_running':
        this.log.info(`The process of '${bundleId}' app was not running`);
        break;
      case 'error':
        this.log.warn(
          `Failed to kill '${bundleId}'. Original error: ${result.detail ?? 'unknown'}`,
        );
        break;
    }
    return false;
  }

  private async terminateRemoteXPC(bundleId: string): Promise<TerminateAppResult> {
    const Services = await getRemoteXPCServices();
    const dvt = await Services.startDVTService(this.udid);
    try {
      const pid = await dvt.processControl.getPidForBundleIdentifier(bundleId);
      if (!pid) {
        return {terminated: false, reason: 'not_running'};
      }
      await dvt.processControl.kill(pid);
      return {terminated: true, pid};
    } finally {
      await dvt.dvtService.close();
    }
  }

  private async terminateLegacy(bundleId: string): Promise<TerminateAppResult> {
    let instrumentService: any;
    let installProxyClient: InstallationProxyClient | undefined;
    try {
      installProxyClient = await InstallationProxyClient.create(this.udid, false);
      const apps = await installProxyClient.listApplications({
        returnAttributes: ['CFBundleIdentifier', 'CFBundleExecutable'],
      });
      if (!apps[bundleId]) {
        return {terminated: false, reason: 'not_running'};
      }
      const executableName = apps[bundleId].CFBundleExecutable;
      this.log.debug(`The executable name for the bundle id '${bundleId}' was '${executableName}'`);
      if (isIos17OrNewerPlatform(this.platformVersion)) {
        this.log.debug(`Calling devicectl to kill the process`);
        const pids = (await this.devicectl.listProcesses())
          .filter(({executable}) => executable.endsWith(`/${executableName}`))
          .map(({processIdentifier}) => processIdentifier);
        if (_.isEmpty(pids)) {
          return {terminated: false, reason: 'not_running'};
        }
        await this.devicectl.sendSignalToProcess(pids[0], 2);
        return {terminated: true, pid: pids[0]};
      }

      // iOS < 17: use instrument service
      instrumentService = await services.startInstrumentService(this.udid);
      const processes = await instrumentService.callChannel(
        INSTRUMENT_CHANNEL.DEVICE_INFO,
        'runningProcesses',
      );
      const process = processes.selector.find((proc: any) => proc.name === executableName);
      if (!process) {
        return {terminated: false, reason: 'not_running'};
      }
      await instrumentService.callChannel(
        INSTRUMENT_CHANNEL.PROCESS_CONTROL,
        'killPid:',
        `${process.pid}`,
      );
      return {terminated: true, pid: process.pid};
    } catch (err) {
      const detail = (err as any).stderr ?? (err as Error).message;
      return {terminated: false, reason: 'error', detail: String(detail)};
    } finally {
      if (installProxyClient) {
        await installProxyClient.close();
      }
      if (instrumentService) {
        instrumentService.close();
      }
    }
  }
}
