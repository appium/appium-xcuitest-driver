import type {AppiumLogger} from '@appium/types';
/** @ts-expect-error no types */
import {services, INSTRUMENT_CHANNEL} from 'appium-ios-device';
import type {Devicectl} from 'node-devicectl';

import {isEmpty, isIos17OrNewerPlatform} from '../utils/index.js';
import {InstallationProxyClient} from './installation-proxy-client.js';
import type {RemoteXPCFacade} from './remote-xpc/index.js';

type TerminateAppResult =
  | {terminated: true; pid: number}
  | {terminated: false; reason: 'not_running' | 'error'; detail?: string};

export class AppTerminationClient {
  constructor(
    private readonly udid: string,
    private readonly platformVersion: string,
    private readonly devicectl: Devicectl,
    private readonly log: AppiumLogger,
    private readonly remoteXPCFacade: RemoteXPCFacade | null = null,
  ) {}

  async terminate(bundleId: string): Promise<boolean> {
    let result: TerminateAppResult | null =
      (await this.remoteXPCFacade?.attemptService(`terminate '${bundleId}'`, async (Services) => {
        const dvt = await Services.startDVTService(this.udid);
        try {
          const pid = await dvt.processControl.getPidForBundleIdentifier(bundleId);
          if (!pid) {
            return {terminated: false, reason: 'not_running'} satisfies TerminateAppResult;
          }
          await dvt.processControl.kill(pid);
          return {terminated: true, pid} satisfies TerminateAppResult;
        } finally {
          await dvt.dvtService.close();
        }
      })) ?? null;

    if (!result) {
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
        this.log.warn(`Failed to kill '${bundleId}'. Original error: ${result.detail ?? 'unknown'}`);
        break;
    }
    return false;
  }

  private async terminateLegacy(bundleId: string): Promise<TerminateAppResult> {
    let instrumentService: any;
    let installProxyClient: InstallationProxyClient | undefined;
    try {
      installProxyClient = await InstallationProxyClient.create(this.udid);
      const apps = await installProxyClient.listApplications({
        returnAttributes: ['CFBundleIdentifier', 'CFBundleExecutable'],
      });
      if (!apps[bundleId]) {
        return {terminated: false, reason: 'not_running'};
      }
      const executableName = apps[bundleId].CFBundleExecutable;
      this.log.debug(`The executable name for the bundle id '${bundleId}' was '${executableName}'`);
      if (isIos17OrNewerPlatform(this.platformVersion)) {
        if (process.platform !== 'darwin') {
          return {
            terminated: false,
            reason: 'error',
            detail: `devicectl is only available on macOS; cannot terminate '${bundleId}' via devicectl from '${process.platform}'`,
          };
        }
        this.log.debug(`Calling devicectl to kill the process`);
        const pids = (await this.devicectl.listProcesses())
          .filter(({executable}) => executable.endsWith(`/${executableName}`))
          .map(({processIdentifier}) => processIdentifier);
        if (isEmpty(pids)) {
          return {terminated: false, reason: 'not_running'};
        }
        await this.devicectl.sendSignalToProcess(pids[0], 2);
        return {terminated: true, pid: pids[0]};
      }

      // iOS < 17: use instrument service
      instrumentService = await services.startInstrumentService(this.udid);
      const processes = await instrumentService.callChannel(INSTRUMENT_CHANNEL.DEVICE_INFO, 'runningProcesses');
      const matchingProcess = processes.selector.find((proc: any) => proc.name === executableName);
      if (!matchingProcess) {
        return {terminated: false, reason: 'not_running'};
      }
      await instrumentService.callChannel(INSTRUMENT_CHANNEL.PROCESS_CONTROL, 'killPid:', `${matchingProcess.pid}`);
      return {terminated: true, pid: matchingProcess.pid};
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
