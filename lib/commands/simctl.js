const SIMCTL_FEATURE = 'simctl';

const commands = {
  /**
   * Run the given command with arguments as `xcrun simctl` subcommand.
   * This method works behind the 'simctl' security flag.
   * @param {string} command Subcommand to run with `xcrun simctl`
   * @param {Array} [args=[]]
   * @returns {Promise<Record<'stdout' | 'stderr' | 'code', number>>} The output of 'exec'.
   */
  async mobileSimctl(command, args = []) {
    this.ensureFeatureEnabled(SIMCTL_FEATURE);
    return await /** @type {import('./../driver').Simulator} */ (this.device).simctl.exec(
      command,
      {args}
    );
  }
};

export default {...commands};
