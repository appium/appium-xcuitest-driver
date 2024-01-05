import {fs} from '@appium/support';

/**
 * Return an executable path of cmd
 *
 * @param {string} cmd Standard output by command
 * @return {Promise<string?>} The full path of cmd. `null` if the cmd is not found.
 */
export async function resolveExecutablePath(cmd) {
  try {
    const executablePath = await fs.which(cmd);
    if (executablePath && (await fs.exists(executablePath))) {
      return executablePath;
    }
  } catch (err) {}
  return null;
}
