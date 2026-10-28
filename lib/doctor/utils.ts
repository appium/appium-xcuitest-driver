import {fileURLToPath} from 'node:url';

import {fs, node} from 'appium/support.js';

import {memoize} from '../utils/index.js';

export const REMOTE_XPC_PACKAGE_NAME = 'appium-ios-remotexpc';

export const isRemoteXpcDependencyAvailable = memoize(
  async function ensureRemoteXpcDependencyAvailable(): Promise<boolean> {
    try {
      // We only care that the module can be imported; we don't need to use it here.
      await import(REMOTE_XPC_PACKAGE_NAME);
      return true;
    } catch {
      return false;
    }
  },
);

export const getXcuitestDriverRoot = memoize(function getXcuitestDriverRoot(): string | null {
  return node.getModuleRootSync('appium-xcuitest-driver', fileURLToPath(import.meta.url));
});

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
