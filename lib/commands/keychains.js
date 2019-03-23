let commands = {}, helpers = {}, extensions = {};

function assertIsSimulator (driver) {
  if (!driver.isSimulator()) {
    throw new Error('Keychains can only be controlled on Simulator');
  }
}

/**
 * Clears keychains on Simulator.
 *
 * @throws {Error} If current device is not a Simulator or there was an error
 * while clearing keychains.
 */
commands.mobileClearKeychains = async function mobileClearKeychains () {
  assertIsSimulator(this);

  await this.opts.device.clearKeychains();
};

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
