import type {AppiumLogger} from '@appium/types';
import type {Devicectl} from 'node-devicectl';

import {isEmpty, supportsApiLevel17} from '../utils/index.js';
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
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  async terminate(bundleId: string): Promise<boolean> {
    let result: TerminateAppResult | null = null;
    try {
      if (await this.remoteXPCFacade.isTunnelTier()) {
        result = await this.terminateViaDvt(bundleId);
      }
    } catch (err) {
      this.log.warn(`Cannot terminate '${bundleId}' via RemoteXPC: ${(err as Error).message}`);
    }
    result ??= await this.terminateViaDevicectl(bundleId);

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

  private async terminateViaDvt(bundleId: string): Promise<TerminateAppResult> {
    return await this.remoteXPCFacade.requireTunnelService(`terminate '${bundleId}'`, async (Services) => {
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
    });
  }

  /**
   * Used when the session has no tunnel or DVT failed: looks up the executable name via
   * InstallationProxy and signals the process through devicectl (macOS only).
   */
  private async terminateViaDevicectl(bundleId: string): Promise<TerminateAppResult> {
    let installProxyClient: InstallationProxyClient | undefined;
    try {
      if (process.platform !== 'darwin' || !supportsApiLevel17(this.platformVersion)) {
        return {
          terminated: false,
          reason: 'error',
          detail: `Terminating '${bundleId}' via devicectl requires macOS and iOS/tvOS 17+ (RemoteXPC is not usable)`,
        };
      }
      installProxyClient = await InstallationProxyClient.create(this.udid, {facade: this.remoteXPCFacade});
      const apps = await installProxyClient.listApplications({
        returnAttributes: ['CFBundleIdentifier', 'CFBundleExecutable'],
      });
      if (!apps[bundleId]) {
        return {terminated: false, reason: 'not_running'};
      }
      const executableName = apps[bundleId].CFBundleExecutable;
      this.log.debug(`The executable name for the bundle id '${bundleId}' was '${String(executableName)}'`);
      this.log.debug(`Calling devicectl to kill the process`);
      const pids = (await this.devicectl.listProcesses())
        .filter(({executable}) => executable.endsWith(`/${String(executableName)}`))
        .map(({processIdentifier}) => processIdentifier);
      if (isEmpty(pids)) {
        return {terminated: false, reason: 'not_running'};
      }
      await this.devicectl.sendSignalToProcess(pids[0], 2);
      return {terminated: true, pid: pids[0]};
    } catch (err) {
      const detail = (err as any).stderr ?? (err as Error).message;
      return {terminated: false, reason: 'error', detail: String(detail)};
    } finally {
      await installProxyClient?.close();
    }
  }
}
