import { errors } from 'appium/driver';

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
];

const commands = {
  /**
   * Run the given command with arguments as `xcrun simctl` subcommand.
   * This method works behind the 'simctl' security flag.
   * @this {XCUITestDriver}
   * @param {string} command Subcommand to run with `xcrun simctl`
   * @param {string[]} [args=[]] arguments for the subcommand. The arguments should be after <device> in the help.
   * @param {number|undefined} timeout - The maximum number of milliseconds
   * @returns {Promise<SimctlExecResponse>}
   * @throws {Error} If the simctl subcommand command returns non-zero return code, or the given subcommand was invalid.
   */
  async mobileSimctl(command, args = [], timeout = undefined) {
    if (!this.isSimulator()) {
      throw new errors.UnsupportedOperationError(`Only simulator is supported.`);
    };

    if (!this.opts.udid) {
      throw new errors.InvalidArgumentError(`Unknown device or simulator UDID: '${this.opts.udid}'`);
    }

    if (!SUBCOMMANDS_HAS_DEVICE.includes(command)) {
      throw new errors.InvalidArgumentError(`The given command '${command}' is not supported. ` +
        `Available subcommands are ${SUBCOMMANDS_HAS_DEVICE.join(',')}`);
    }

    return await /** @type {import('./../driver').Simulator} */ (this.device).simctl.exec(
      command,
      {args: [this.opts.udid, ...args], timeout}
    );
  }
};

export default {...commands};

/**
 * @typedef {Object} SimctlExecResponse
 * @property {string} stdout The output of standard out.
 * @property {string} stderr The output of standard error.
 * @property {number} code Return code.
 */

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
