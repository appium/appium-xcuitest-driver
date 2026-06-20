/**
 * Ensures a driver helper script is run with elevated privileges on platforms that expose getuid.
 *
 * @param {string} scriptName
 */
export function assertRoot(scriptName) {
  if (typeof process.getuid !== 'function') {
    return;
  }
  if (process.getuid() !== 0) {
    throw new Error(
      `This script must be run as root (e.g. sudo appium driver run xcuitest ${scriptName} ...).`,
    );
  }
}
