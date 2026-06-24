import { exec } from 'teen_process';

/**
 * Ensures a helper script is run with elevated privileges.
 *
 * @param {string} relativeScriptPath
 */
export async function assertRoot(relativeScriptPath) {
  if (process.platform === 'win32') {
    await assertWindowsAdmin(relativeScriptPath);
    return;
  }

  if (typeof process.getuid !== 'function') {
    return;
  }
  if (process.getuid() !== 0) {
    throw new Error(`This script must be run as root/admin (e.g. sudo node "${relativeScriptPath}").`);
  }
}

/**
 * @param {string} relativeScriptPath
 */
async function assertWindowsAdmin(relativeScriptPath) {
  try {
    await exec('net', ['session']);
  } catch {
    throw new Error(
      `This script must be run as Administrator (e.g. from an elevated terminal: node "${relativeScriptPath}").`,
    );
  }
}
