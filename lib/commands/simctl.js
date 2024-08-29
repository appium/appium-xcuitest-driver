const SIMCTL_FEATURE = 'simctl';

const commands = {
  /**
   * Run the given commands and arguments under `xcrun simctl` command.
   * This method works behind the simctl security flag.
   * @param {string} command
   * @param {Array} [args=[]]
   * @returns The output of exec. 'stdout', 'stderr' and 'code' keys
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
