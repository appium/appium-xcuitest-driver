import { errors } from 'appium/driver';
import {requireSimulator} from '../utils';
import type {XCUITestDriver} from '../driver';
import type {Simulator} from 'appium-ios-simulator';

/**
 * List of subcommands for `simctl` we provide as mobile simctl command.
 * They accept 'device' target.
 */
const SUBCOMMANDS_HAS_DEVICE = [
  'boot',
  'get_app_container',
  'getenv',
  'icloud_sync',
  'install',
  'install_app_data',
  'io',
  'keychain',
  'launch',
  'location',
  'logverbose',
  'openurl',
  'pbcopy',
  'pbpaste',
  'privacy',
  'push',
  'shutdown',
  'spawn',
  'status_bar',
  'terminate',
  'ui',
  'uninstall'
] as const;

export interface SimctlExecResponse {
  /** The output of standard out. */
  stdout: string;
  /** The output of standard error. */
  stderr: string;
  /** Return code. */
  code: number;
}

/**
 * Run the given command with arguments as `xcrun simctl` subcommand.
 * This method works behind the 'simctl' security flag.
 *
 * @param command - Subcommand to run with `xcrun simctl`. Must be one of the supported commands.
 * @param args - Arguments for the subcommand. The arguments should be after <device> in the help.
 * @param timeout - The maximum number of milliseconds
 * @returns The execution result with stdout, stderr, and return code
 * @throws If the simctl subcommand command returns non-zero return code, or the given subcommand was invalid.
 */
export async function mobileSimctl(
  this: XCUITestDriver,
  command: string,
  args: string[] = [],
  timeout?: number,
): Promise<SimctlExecResponse> {
  const simulator: Simulator = requireSimulator(this, 'simctl command');

  if (!this.opts.udid) {
    throw new errors.InvalidArgumentError(`Unknown simulator UDID: '${this.opts.udid}'`);
  }

  if (!(SUBCOMMANDS_HAS_DEVICE as readonly string[]).includes(command)) {
    throw new errors.InvalidArgumentError(`The given command '${command}' is not supported. ` +
      `Available subcommands are ${SUBCOMMANDS_HAS_DEVICE.join(',')}`);
  }

  const result = await simulator.simctl.exec(
    command as typeof SUBCOMMANDS_HAS_DEVICE[number],
    {args: [this.opts.udid, ...args], timeout}
  );
  return {
    stdout: result?.stdout ?? '',
    stderr: result?.stderr ?? '',
    code: result?.code ?? 0
  };
}

