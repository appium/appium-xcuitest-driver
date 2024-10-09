import _ from 'lodash';
import {exec, SubProcess} from 'teen_process';
import {fs, util, tempDir} from 'appium/support';
import path from 'path';
import { BaseDeviceClient } from './base-device-client';
import type { BaseDeviceClientOptions, InstallProfileArgs } from './base-device-client';
import type { TeenProcessExecResult } from 'teen_process';
import type { CertificateList } from '../commands/types';

// https://github.com/danielpaulus/go-ios

const BINARY_NAME = 'ios';
const CRASH_REPORT_EXT = '.ips';
const PCAP_FILE_NAME_PATTERN = /Create pcap file: (dump-\\d+.pcap)/;

export interface GoIosOptions extends BaseDeviceClientOptions {
  udid: string;
}

interface ExecuteOptions {
  cwd?: string;
  logStderr?: boolean;
  asynchronous?: boolean;
  autoStart?: boolean;
}

export class GoIos extends BaseDeviceClient {
  private readonly _udid: string;
  private _binaryPath: string | null;

  constructor(opts: GoIosOptions) {
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
            `Please make sure go-ios is installed. Visit https://github.com/danielpaulus/go-ios for ` +
            `more details.`,
        );
      }
      return false;
    }
  }

  override async listProfiles(): Promise<CertificateList> {
    const {stderr} = await this.execute(['profile', 'list']);
    for (const line of stderr.split('\n')) {
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('[')) {
        continue;
      }
      // TODO: Align payload
      return JSON.parse(trimmedLine);
    }
    return {
      OrderedIdentifiers: [],
      ProfileManifest: {},
      ProfileMetadata: {},
      Status: 'Acknowledged',
    };
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
      await this.execute(['profile', 'add', srcPath], {
        logStderr: true,
      });
    } finally {
      if (tmpRoot) {
        await fs.rimraf(tmpRoot);
      }
    }
  }

  override async removeProfile(name: string): Promise<string> {
    return (
      await this.execute(['profiles', 'remove', name], {logStderr: true})
    ).stderr;
  }

  override async listCrashes(): Promise<string[]> {
    const {stderr} = await this.execute(['crash', 'ls']);
    const crashFiles: string[] = [];
    for (const line of stderr.split('\n')) {
      if (!_.includes(line, '"files":')) {
        continue;
      }
      crashFiles.push(...JSON.parse(line).files);
    }
    return crashFiles.filter((x: string) => x.endsWith(CRASH_REPORT_EXT));
  }

  override async exportCrash(name: string, dstFolder: string): Promise<void> {
    await this.execute(['crash', 'cp', name, dstFolder]);
  }

  override async collectPcap(dstFile: string): Promise<SubProcess> {
    const tmpRoot = await tempDir.openDir();
    const process = await this.execute(['pcap'], {
      asynchronous: true,
      cwd: tmpRoot,
    });
    let tmpPcapName: string | null = null;
    const parseFileName = (line: string) => {
      const match = PCAP_FILE_NAME_PATTERN.exec(line);
      if (!match) {
        return null;
      }
      tmpPcapName = match[1];
      this.log.debug(`Set the soure pcap log name to '${tmpPcapName}'`);
      return tmpPcapName;
    };
    process.on('line-stderr', (line: string) => {
      if (parseFileName(line)) {
        process.off('line-stderr', parseFileName);
      }
    });
    process.once('exit', async () => {
      const fullPath = path.join(tmpRoot, tmpPcapName ?? '');
      try {
        if (!tmpPcapName) {
          this.log.warn(`The source pcap log name is unknown`);
          return;
        }
        if (!await fs.exists(fullPath)) {
          this.log.warn(`The pcap log at '${fullPath}' does not exist`);
          return;
        }
        await fs.mv(fullPath, dstFile);
      } catch (e) {
        this.log.warn(`Cannot move pcap log from '${fullPath}' to '${dstFile}': ${e.message}`);
      } finally {
        await fs.rimraf(tmpRoot);
      }
    });
    return process;
  }

  private async execute<T extends ExecuteOptions>(
    args: string[],
    opts?: T
  ): Promise<T extends ({asynchronous: true}) ? SubProcess : TeenProcessExecResult<string>> {
    await this.assertExists();
    const {cwd, logStderr = false, asynchronous = false, autoStart} = opts ?? {};

    const finalArgs = [...args, '--udid', this._udid];
    const binaryPath = this._binaryPath as string;
    const cmdStr = util.quote([binaryPath, ...finalArgs]);
    this.log.debug(`Executing ${cmdStr}`);
    try {
      if (asynchronous) {
        const result = new SubProcess(binaryPath, finalArgs, {cwd});
        if (autoStart) {
          await result.start(0);
        }
        //@ts-ignore This is ok
        return result;
      }
      const result = await exec(binaryPath, finalArgs, {cwd});
      if (logStderr) {
        this.log.debug(`Command output: ${result.stderr}`);
      }
      //@ts-ignore This is ok
      return result;
    } catch (e) {
      throw new Error(`'${cmdStr}' failed. Original error: ${e.stderr || e.stdout || e.message}`);
    }
  }
}

