import type { AppiumLogger } from '@appium/types';
import type { SubProcess } from 'teen_process';

export interface BaseDeviceClientOptions {
  log: AppiumLogger;
}

export interface InstallProfileArgs {
  profilePath?: string;
  payload?: string|Buffer;
}

export abstract class BaseDeviceClient {
  private readonly _log: AppiumLogger;

  constructor (opts: BaseDeviceClientOptions) {
    this._log = opts.log;
  }

  get log(): AppiumLogger {
    return this._log;
  }

  abstract assertExists(isStrict: boolean): Promise<boolean>;

  abstract listProfiles(): Promise<object>;
  abstract installProfile(args: InstallProfileArgs): Promise<void>;
  abstract removeProfile(name: string): Promise<string>;

  abstract listCrashes(): Promise<string[]>;
  abstract exportCrash(name: string, dstFolder: string): Promise<void>;

  abstract collectPcap(dstFile: string): Promise<SubProcess>;
}
