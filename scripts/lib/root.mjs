import {exec} from 'teen_process';

const COMMAND_PREFIX = 'appium driver run xcuitest';

/**
 * Ensures a helper script is run with elevated privileges.
 *
 * @param {string} scriptName
 */
export async function assertRoot(scriptName) {
  if (process.platform === 'win32') {
    await assertWindowsAdmin(scriptName);
    return;
  }

  if (typeof process.getuid !== 'function') {
    return;
  }
  if (process.getuid() !== 0) {
    throw new Error(
      `This script must be run as root/admin (e.g. sudo ${COMMAND_PREFIX} "${scriptName}").`,
    );
  }
}

/**
 * @param {string} scriptName
 */
async function assertWindowsAdmin(scriptName) {
  try {
    await exec('net', ['session']);
  } catch {
    throw new Error(
      `This script must be run as Administrator (e.g. from an elevated terminal: ${COMMAND_PREFIX} "${scriptName}").`,
    );
  }
}
