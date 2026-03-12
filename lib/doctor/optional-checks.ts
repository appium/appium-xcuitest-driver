import {resolveExecutablePath} from './utils';
import {doctor, fs, node} from 'appium/support';
import axios from 'axios';
import type {IDoctorCheck, AppiumLogger, DoctorCheckResult} from '@appium/types';
import '@colors/colors';
import {exec, SubProcess} from 'teen_process';
import memoize from 'lodash/memoize';

export class OptionalSimulatorCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly SUPPORTED_SIMULATOR_PLATFORMS: SimulatorPlatform[] = [
    {
      displayName: 'iOS',
      name: 'iphonesimulator',
    },
    {
      displayName: 'tvOS',
      name: 'appletvsimulator',
    },
  ];

  async diagnose(): Promise<DoctorCheckResult> {
    try {
      // https://github.com/appium/appium/issues/12093#issuecomment-459358120
      await exec('xcrun', ['simctl', 'help']);
    } catch (err: any) {
      return doctor.nokOptional(
        `Testing on Simulator is not possible. Cannot run 'xcrun simctl': ${
          err?.stderr || (err as Error).message
        }`,
      );
    }

    const sdks = await this._listInstalledSdks();
    for (const {displayName, name} of OptionalSimulatorCheck.SUPPORTED_SIMULATOR_PLATFORMS) {
      const errorPrefix = `Testing on ${displayName} Simulator is not possible`;
      if (!sdks.some(({platform}) => platform === name)) {
        return doctor.nokOptional(`${errorPrefix}: SDK is not installed`);
      }
    }

    return doctor.okOptional(
      `The following Simulator SDKs are installed:\n` +
        sdks
          .filter(({platform}) =>
            OptionalSimulatorCheck.SUPPORTED_SIMULATOR_PLATFORMS.some(
              ({name}) => name === platform,
            ),
          )
          .map(({displayName}) => `\t→ ${displayName}`)
          .join('\n'),
    );
  }

  async fix(): Promise<string> {
    return `Install the desired Simulator SDK from Xcode's Settings -> Components`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }

  private async _listInstalledSdks(): Promise<InstalledSdk[]> {
    const {stdout} = await exec('xcodebuild', ['-json', '-showsdks']);
    return JSON.parse(stdout);
  }
}
export const optionalSimulatorCheck = new OptionalSimulatorCheck();

export class OptionalApplesimutilsCommandCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly README_LINK =
    'https://github.com/appium/appium-xcuitest-driver/blob/master/docs/reference/execute-methods.md#mobile-setpermission';

  async diagnose(): Promise<DoctorCheckResult> {
    const applesimutilsPath = await resolveExecutablePath('applesimutils');
    return applesimutilsPath
      ? doctor.okOptional(`applesimutils is installed at: ${applesimutilsPath}`)
      : doctor.nokOptional('applesimutils are not installed');
  }

  async fix(): Promise<string> {
    return `Why ${'applesimutils'.bold} is needed and how to install it: ${OptionalApplesimutilsCommandCheck.README_LINK}`;
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalApplesimutilsCheck = new OptionalApplesimutilsCommandCheck();

export class OptionalFfmpegCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly FFMPEG_BINARY = 'ffmpeg';
  static readonly FFMPEG_INSTALL_LINK = 'https://www.ffmpeg.org/download.html';

  async diagnose(): Promise<DoctorCheckResult> {
    const ffmpegPath = await resolveExecutablePath(OptionalFfmpegCheck.FFMPEG_BINARY);

    return ffmpegPath
      ? doctor.okOptional(`${OptionalFfmpegCheck.FFMPEG_BINARY} exists at '${ffmpegPath}'`)
      : doctor.nokOptional(`${OptionalFfmpegCheck.FFMPEG_BINARY} cannot be found`);
  }

  async fix(): Promise<string> {
    return (
      `${`${OptionalFfmpegCheck.FFMPEG_BINARY}`.bold} is used to capture screen recordings from the device under test. ` +
      `Please read ${OptionalFfmpegCheck.FFMPEG_INSTALL_LINK}.`
    );
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalFfmpegCheck = new OptionalFfmpegCheck();

const REMOTE_XPC_PACKAGE_NAME = 'appium-ios-remotexpc';

const ensureRemoteXpcDependencyAvailable = memoize(async function ensureRemoteXpcDependencyAvailable(): Promise<boolean> {
  try {
    // We only care that the module can be imported; we don't need to use it here.
    await import(REMOTE_XPC_PACKAGE_NAME);
    return true;
  } catch {
    return false;
  }
});

const getXcuitestDriverRoot = memoize(function getXcuitestDriverRoot(): string | null {
  return node.getModuleRootSync('appium-xcuitest-driver', __filename);
});

export class OptionalIosRemoteXpcDependencyCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly README_LINK = 'https://github.com/appium/appium-ios-remotexpc';

  async diagnose(): Promise<DoctorCheckResult> {
    const available = await ensureRemoteXpcDependencyAvailable();
    if (available) {
      return doctor.okOptional(
        `${REMOTE_XPC_PACKAGE_NAME} is installed and can be imported. ` +
          `Remote XPC-based features are available for real devices (iOS/tvOS 18+).`,
      );
    }
    return doctor.nokOptional(
      `${REMOTE_XPC_PACKAGE_NAME} is not installed or cannot be imported. ` +
        `Install it as an optional dependency if you plan to use Remote XPC-based features ` +
        `on real devices (iOS/tvOS 18+). Tests may still run without it, but some ` +
        `advanced functionality might not work or be unavailable.`,
    );
  }

  async fix(): Promise<string> {
    const driverRoot = getXcuitestDriverRoot();
    const locationHint = driverRoot ? `cd "${driverRoot}"; ` : '';
    return (
      `${`${REMOTE_XPC_PACKAGE_NAME}`.bold} provides Remote XPC communication ` +
      `and tunneling support for real devices (iOS/tvOS 18+). ` +
      `Run '${locationHint}npm install ${REMOTE_XPC_PACKAGE_NAME}'. ` +
      `For more information, see ${OptionalIosRemoteXpcDependencyCheck.README_LINK}.`
    );
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalIosRemoteXpcDependencyCheck = new OptionalIosRemoteXpcDependencyCheck();

const TUNNEL_SCRIPT_TIMEOUT_MS = 5000;
const API_READY_PATTERN = /:\d+\/remotexpc\/tunnels/;

export class OptionalTunnelAvailabilityCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly README_LINK = 'https://github.com/appium/appium-ios-tuntap';
  static readonly TUNNEL_CREATION_COMMAND = 'appium driver run xcuitest tunnel-creation';

  async diagnose(): Promise<DoctorCheckResult> {
    const remoteXpcAvailable = await ensureRemoteXpcDependencyAvailable();
    if (!remoteXpcAvailable) {
      return doctor.nokOptional(
        `Remote XPC tunnel availability cannot be checked because ` +
          `${REMOTE_XPC_PACKAGE_NAME} is not installed or cannot be imported. ` +
          `Install it first using the '${REMOTE_XPC_PACKAGE_NAME}' optional check.`,
      );
    }

    const platform = process.platform;
    if (platform !== 'darwin' && platform !== 'linux') {
      return doctor.okOptional(
        `Tunnel availability status cannot be automatically verified on platform '${platform}'.`,
      );
    }

    const candidatePorts = await this._getListeningTcpPorts();
    if (candidatePorts.length > 0) {
      const registryResult = await this._probeTunnelRegistry(candidatePorts);
      if (registryResult) {
        return registryResult;
      }
    }

    return await this._runTunnelCreationScript();
  }

  /**
   * Returns listening TCP ports. Uses pure Node on Linux (/proc/net/tcp, tcp6); uses netstat on macOS.
   */
  private async _getListeningTcpPorts(): Promise<number[]> {
    if (process.platform === 'linux') {
      return await this._getListeningTcpPortsLinux();
    }
    if (process.platform === 'darwin') {
      return await this._getListeningTcpPortsDarwin();
    }
    return [];
  }

  /**
   * Linux: parse /proc/net/tcp and /proc/net/tcp6 (pure Node, no exec). State 0A = LISTEN.
   */
  private async _getListeningTcpPortsLinux(): Promise<number[]> {
    const ports = new Set<number>();
    const files = ['/proc/net/tcp', '/proc/net/tcp6'] as const;
    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf8');
        const lines = raw.split('\n');
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length < 4) {
            continue;
          }
          const state = parts[3];
          if (state !== '0A') {
            continue; // 0A = LISTEN
          }
          const localAddr = parts[1];
          const colon = localAddr.lastIndexOf(':');
          if (colon === -1) {
            continue;
          }
          const portHex = localAddr.slice(colon + 1);
          const port = Number.parseInt(portHex, 16);
          if (Number.isInteger(port) && port > 0 && port <= 65535) {
            ports.add(port);
          }
        }
      } catch {
        // File missing or unreadable (e.g. not Linux or permissions)
      }
    }
    return Array.from(ports);
  }

  /**
   * macOS: netstat -anv -p tcp (Node has no API for system-wide listening ports).
   */
  private async _getListeningTcpPortsDarwin(): Promise<number[]> {
    try {
      const {stdout} = await exec('netstat', ['-anv', '-p', 'tcp']);
      const ports = new Set<number>();
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.toLowerCase().startsWith('tcp')) {
          continue;
        }
        const parts = trimmed.split(/\s+/);
        if (parts.length < 4) {
          continue;
        }
        const portMatch = /\.(\d+)$/.exec(parts[3]);
        if (!portMatch) {
          continue;
        }
        const port = Number.parseInt(portMatch[1], 10);
        if (Number.isInteger(port) && port > 0) {
          ports.add(port);
        }
      }
      return Array.from(ports);
    } catch {
      return [];
    }
  }

  /**
   * Probes candidate ports for the tunnel registry API in parallel; resolves as soon as any succeed, else null.
   */
  private async _probeTunnelRegistry(ports: number[]): Promise<DoctorCheckResult | null> {
    if (ports.length === 0) {
      return null;
    }

    return await new Promise<DoctorCheckResult | null>((resolve) => {
      let settled = false;
      let remaining = ports.length;

      const maybeResolveNull = () => {
        remaining -= 1;
        if (!settled && remaining === 0) {
          settled = true;
          resolve(null);
        }
      };

      for (const port of ports) {
        (async () => {
          try {
            const res = await axios.get(`http://127.0.0.1:${port}/remotexpc/tunnels`, {
              timeout: 1000,
              validateStatus: (status) => status === 200,
            });
            const data = res.data as any;
            if (!settled && data != null && typeof data === 'object' && data.status === 'OK') {
              settled = true;
              resolve(
                doctor.okOptional(
                  `Detected an active Remote XPC tunnel registry process on port ${port}. ` +
                    `The Remote XPC tunnel infrastructure appears to be available, so Remote XPC-based ` +
                    `features for real devices (iOS/tvOS 18+) should be available.`,
                ),
              );
              return;
            }
          } catch {
            // Ignore individual probe failures; we'll resolve to null only if all fail.
          }
          if (!settled) {
            maybeResolveNull();
          }
        })();
      }
    });
  }

  /**
   * Runs the tunnel-creation driver script as a subprocess to avoid blocking doctor if the script hangs.
   * Waits for exit, TUNNEL_SCRIPT_TIMEOUT_MS (5s), or output string indicating registry is up;
   * then evaluates or stops the process.
   */
  private async _runTunnelCreationScript(): Promise<DoctorCheckResult> {
    const homeCwd = process.env.HOME || process.cwd();
    const driverRoot = getXcuitestDriverRoot();

    let combinedOutput = '';
    let resolveApiReady: () => void;
    const apiReadyPromise = new Promise<{reason: 'api'}>((resolve) => {
      resolveApiReady = () => resolve({reason: 'api'});
    });
    const sub = driverRoot != null
      ? new SubProcess(process.execPath, ['./scripts/tunnel-creation.mjs'], {cwd: driverRoot})
      : new SubProcess('appium', ['driver', 'run', 'xcuitest', 'tunnel-creation'], {cwd: homeCwd});
    const appendLine = (line: string) => {
      combinedOutput += line + '\n';
      if (API_READY_PATTERN.test(line)) {
        resolveApiReady();
      }
    };
    sub.on('line-stdout', appendLine);
    sub.on('line-stderr', appendLine);

    const exitPromise = new Promise<{reason: 'exit'; code?: number; signal?: string}>((resolve) => {
      sub.once('exit', (code, signal) => resolve({reason: 'exit', code, signal}));
    });
    const timeoutPromise = new Promise<{reason: 'timeout'}>((resolve) => {
      setTimeout(() => resolve({reason: 'timeout'}), TUNNEL_SCRIPT_TIMEOUT_MS);
    });

    try {
      await sub.start(0);
    } catch (err) {
      const message = ((err as any).stderr || (err as Error).message || '').toString();
      return doctor.nokOptional(
        `Could not start '${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}'. ` +
          `Without a working tunnel, Remote XPC-based functionality on real devices (iOS/tvOS 18+) might not work or be unavailable. ` +
          `Details: ${message}`,
      );
    }

    const winner = await Promise.race([exitPromise, timeoutPromise, apiReadyPromise]);

    if (winner.reason === 'exit') {
      const code = (winner as {reason: 'exit'; code?: number; signal?: string}).code;
      return this._evaluateTunnelScriptOutput(combinedOutput.trim(), code);
    }

    if (sub.isRunning) {
      try {
        await sub.stop('SIGTERM', 500);
      } catch {
        // ignore
      }
    }
    return doctor.okOptional(
      `The tunnel script was started; the registry was detected or the check timed out. ` +
        `Tunnel infrastructure for real devices (iOS/tvOS 18+) should be available when run with sufficient privileges.`,
    );
  }

  /**
   * Interprets tunnel-creation script stdout+stderr and optional exit code; returns the appropriate doctor result.
   * Output pattern matches take priority over a non-zero exit code.
   */
  private _evaluateTunnelScriptOutput(combinedOutput: string, exitCode?: number | null): DoctorCheckResult {
    if (/No devices found/i.test(combinedOutput)) {
      return doctor.okOptional(
        `The Remote XPC tunnel-creation script can be invoked via '${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}', ` +
          `but no real devices are currently connected.`,
      );
    }
    if (/operation not permitted|permission denied/i.test(combinedOutput)) {
      return doctor.okOptional(
        `The tunnel-creation script '${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}' is available, ` +
          `but could not create a TUN/TAP interface without elevated privileges (` +
          `${'Operation not permitted'.bold}). ` +
          `This is expected when not running with sudo/root. ` +
          `When you actually need Remote XPC-based functionality for real devices (iOS/tvOS 18+), ` +
          `run the same command with sufficient privileges to establish the tunnel.`,
      );
    }
    if (exitCode != null && exitCode !== 0) {
      return doctor.nokOptional(
        `The tunnel script exited with code ${exitCode}. ` +
          `Without a working tunnel, Remote XPC-based functionality on real devices (iOS/tvOS 18+) might not work. ` +
          (combinedOutput ? `Output:\n${combinedOutput}` : ''),
      );
    }
    return doctor.okOptional(
      `Successfully ran '${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}' without sudo. ` +
        `The Remote XPC tunnel infrastructure should be available for creating tunnels.` +
        (combinedOutput ? `\nLast output:\n${combinedOutput}` : ''),
    );
  }

  async fix(): Promise<string> {
    return (
      `The Remote XPC tunnel infrastructure is used for IPv6 tunneling when testing against real ` +
      `devices (iOS/tvOS 18+). ` +
      `To explicitly start or verify tunnels when needed, run ` +
      `'${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}' with sudo/root privileges. ` +
      `See ${OptionalTunnelAvailabilityCheck.README_LINK} for more details about tunnel usage.`
    );
  }

  hasAutofix(): boolean {
    return false;
  }

  isOptional(): boolean {
    return true;
  }
}
export const optionalTunnelAvailabilityCheck = new OptionalTunnelAvailabilityCheck();

interface SimulatorPlatform {
  displayName: string;
  name: string;
}

interface InstalledSdk {
  buildID?: string;
  canonicalName: string;
  displayName: string;
  isBaseSdk: boolean;
  platform: string;
  platformPath: string;
  platformVersion: string;
  productBuildVersion?: string;
  productCopyright?: string;
  productName?: string;
  productVersion?: string;
  sdkPath: string;
  sdkVersion: string;
}
