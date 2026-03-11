import {resolveExecutablePath} from './utils';
import {doctor, node} from 'appium/support';
import axios from 'axios';
import type {IDoctorCheck, AppiumLogger, DoctorCheckResult} from '@appium/types';
import '@colors/colors';
import {exec} from 'teen_process';

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

export class OptionalIosRemoteXpcDependencyCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly PACKAGE_NAME = 'appium-ios-remotexpc';
  static readonly README_LINK = 'https://github.com/appium/appium-ios-remotexpc';

  async diagnose(): Promise<DoctorCheckResult> {
    try {
      // We only care that the module can be imported; we don't need to use it here.
      await import(OptionalIosRemoteXpcDependencyCheck.PACKAGE_NAME);
      return doctor.okOptional(
        `${OptionalIosRemoteXpcDependencyCheck.PACKAGE_NAME} is installed and can be imported. ` +
          `Remote XPC-based features are available for real devices (iOS/tvOS 18+).`,
      );
    } catch {
      return doctor.nokOptional(
        `${OptionalIosRemoteXpcDependencyCheck.PACKAGE_NAME} is not installed or cannot be imported. ` +
          `Install it as an optional dependency if you plan to use Remote XPC-based features ` +
          `on real devices (iOS/tvOS 18+). Tests may still run without it, but some ` +
          `advanced functionality might not work or be unavailable.`,
      );
    }
  }

  async fix(): Promise<string> {
    const driverRoot = node.getModuleRootSync('appium-xcuitest-driver', __filename);
    const locationHint = driverRoot ? `cd "${driverRoot}"; ` : '';
    return (
      `${`${OptionalIosRemoteXpcDependencyCheck.PACKAGE_NAME}`.bold} provides Remote XPC communication ` +
      `and tunneling support for real devices (iOS/tvOS 18+). ` +
      `Run '${locationHint}npm install ${OptionalIosRemoteXpcDependencyCheck.PACKAGE_NAME}'. ` +
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

export class OptionalTunnelAvailabilityCheck implements IDoctorCheck {
  log!: AppiumLogger;
  static readonly README_LINK = 'https://github.com/appium/appium-ios-tuntap';
  static readonly TUNNEL_CREATION_COMMAND = 'appium driver run xcuitest tunnel-creation';

  async diagnose(): Promise<DoctorCheckResult> {
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
   * Returns listening TCP ports from netstat (includes root-owned sockets).
   */
  private async _getListeningTcpPorts(): Promise<number[]> {
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
                  `Detected an active Remote XPC tunnel registry owned by a Node.js process on port ${port}. ` +
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
   * Runs the tunnel-creation driver script (no sudo) and returns a doctor result from its output.
   */
  private async _runTunnelCreationScript(): Promise<DoctorCheckResult> {
    try {
      const homeCwd = process.env.HOME || process.cwd();
      const {stdout, stderr} = await exec(
        'appium',
        ['driver', 'run', 'xcuitest', 'tunnel-creation'],
        {cwd: homeCwd},
      );
      const combinedOutput = `${stdout}\n${stderr}`.trim();

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

      return doctor.okOptional(
        `Successfully ran '${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}' without sudo. ` +
          `The Remote XPC tunnel infrastructure should be available for creating tunnels.` +
          (combinedOutput ? `\nLast output:\n${combinedOutput}` : ''),
      );
    } catch (err) {
      const message = ((err as any).stderr || (err as Error).message || '').toString();
      return doctor.nokOptional(
        `Failed to verify TUN/TAP tunnel via '${OptionalTunnelAvailabilityCheck.TUNNEL_CREATION_COMMAND}'. ` +
          `Without a working tunnel, tests may still run but Remote XPC-based functionality ` +
          `on real devices (iOS/tvOS 18+) might not work or be unavailable. ` +
          `Details: ${message}`,
      );
    }
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
