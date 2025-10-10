import {fs} from 'appium/support';

/**
 * Return an executable path of cmd
 *
 * @param cmd Standard output by command
 * @return The full path of cmd. `null` if the cmd is not found.
 */
export async function resolveExecutablePath(cmd: string): Promise<string | null> {
  try {
    const executablePath = await fs.which(cmd);
    if (executablePath && (await fs.exists(executablePath))) {
      return executablePath;
    }
  } catch {}
  return null;
}

