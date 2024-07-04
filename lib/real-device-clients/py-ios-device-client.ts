import {exec, SubProcess} from 'teen_process';
import {fs, util, tempDir} from 'appium/support';
import path from 'path';
import { BaseDeviceClient } from './base-device-client';
import type { BaseDeviceClientOptions, InstallProfileArgs } from './base-device-client';
import type { TeenProcessExecResult } from 'teen_process';
import type { CertificateList } from '../commands/types';

// https://github.com/YueChen-C/py-ios-device

const BINARY_NAME = 'pyidevice';
const CRASH_REPORT_EXT = '.ips';

export interface PyideviceOptions extends BaseDeviceClientOptions {
  udid: string;
}

interface ExecuteOptions {
  cwd?: string;
  format?: string | null;
  logStdout?: boolean;
  asynchronous?: boolean;
}

export class Pyidevice extends BaseDeviceClient {
  private readonly _udid: string;
  private _binaryPath: string | null;

  constructor(opts: PyideviceOptions) {
    super({log: opts.log});
    this._udid = opts.udid;
    this._binaryPath = null;
  }

  override async assertExists(isStrict = true): Promise<boolean> {
    if (this._binaryPath) {
      return true;
    }

    try {
      this._binaryPath = await fs.which(BINARY_NAME);
      return true;
    } catch (e) {
      if (isStrict) {
        throw new Error(
          `${BINARY_NAME} binary cannot be found in PATH. ` +
            `Please make sure it is installed. Visit https://github.com/YueChen-C/py-ios-device for ` +
            `more details.`,
        );
      }
      return false;
    }
  }

  override async listProfiles(): Promise<CertificateList> {
    const {stdout} = await this.execute(['profiles', 'list']) as TeenProcessExecResult<string>;
    return JSON.parse(stdout);
  }

  override async installProfile(args: InstallProfileArgs): Promise<void> {
    const {profilePath, payload} = args;
    if (!profilePath && !payload) {
      throw new Error('Either the full path to the profile or its payload must be provided');
    }

    let tmpRoot: string | undefined;
    let srcPath = profilePath;
    try {
      if (!srcPath) {
        tmpRoot = await tempDir.openDir();
        srcPath = path.join(tmpRoot, 'cert.pem');
        if (Buffer.isBuffer(payload)) {
          await fs.writeFile(srcPath, payload);
        } else {
          await fs.writeFile(srcPath, payload as string, 'utf8');
        }
      }
      await this.execute(['profiles', 'install', '--path', srcPath], {
        logStdout: true,
      });
    } finally {
      if (tmpRoot) {
        await fs.rimraf(tmpRoot);
      }
    }
  }

  override async removeProfile(name: string): Promise<string> {
    return (
      await this.execute(['profiles', 'remove', '--name', name], {logStdout: true}) as TeenProcessExecResult<string>
    ).stdout;
  }

  override async listCrashes(): Promise<string[]> {
    const {stdout} = await this.execute(['crash', 'list']) as TeenProcessExecResult<string>;
    // Example output:
    // ['.', '..', 'SiriSearchFeedback-2023-12-06-144043.ips', '
    // SiriSearchFeedback-2024-05-22-194219.ips', 'JetsamEvent-2024-05-23-225056.ips',
    // 'JetsamEvent-2023-09-18-090920.ips', 'JetsamEvent-2024-05-16-054529.ips',
    // 'Assistant']
    return JSON.parse(stdout.replace(/'/g, '"'))
      .filter((x: string) => x.endsWith(CRASH_REPORT_EXT));
  }

  override async exportCrash(name: string, dstFolder: string): Promise<void> {
    await this.execute(['crash', 'export', '--name', name], {
      logStdout: true,
      // The tool exports crash reports to the current working dir
      cwd: dstFolder,
    });
  }

  override async collectPcap(dstFile: string): Promise<SubProcess> {
    return await this.execute(['pcapd', dstFile], {
      format: null,
      asynchronous: true,
    }) as SubProcess;
  }

  private async execute(
    args: string[],
    opts: ExecuteOptions = {}
  ): Promise<TeenProcessExecResult<string> | SubProcess> {
    await this.assertExists();
    const {cwd, format = 'json', logStdout = false, asynchronous = false} = opts;

    const finalArgs = [...args, '--udid', this._udid, '--network'];
    if (format) {
      finalArgs.push('--format', format);
    }
    const binaryPath = this._binaryPath as string;
    const cmdStr = util.quote([binaryPath, ...finalArgs]);
    this.log.debug(`Executing ${cmdStr}`);
    try {
      if (asynchronous) {
        const result = new SubProcess(binaryPath, finalArgs, {cwd});
        await result.start(0);
        return result;
      }
      const result = await exec(binaryPath, finalArgs, {cwd});
      if (logStdout) {
        this.log.debug(`Command output: ${result.stdout}`);
      }
      return result;
    } catch (e) {
      throw new Error(`'${cmdStr}' failed. Original error: ${e.stderr || e.stdout || e.message}`);
    }
  }
}
