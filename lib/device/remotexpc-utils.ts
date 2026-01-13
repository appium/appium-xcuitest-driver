import {node, fs} from 'appium/support';
import path from 'node:path';
import type {Services} from 'appium-ios-remotexpc';

/**
 * Cached RemoteXPC Services module
 */
let cachedRemoteXPCServices: typeof Services | null = null;

/**
 * Module root and version
 */
let moduleRoot: string;
let remoteXpcVersion: string | undefined;

(async () => {
  try {
    moduleRoot = node.getModuleRootSync('appium-xcuitest-driver', __filename)!;
    const packageJsonPath = path.join(moduleRoot, 'package.json');
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
    if (packageJsonContent) {
      const packageJson = JSON.parse(packageJsonContent);
      remoteXpcVersion = packageJson.optionalDependencies?.['appium-ios-remotexpc'];
    }
  } catch {
    // Fallback if reading package.json fails
    remoteXpcVersion = '^0.x';
  }
})();

/**
 * Get the RemoteXPC Services module dynamically
 *
 * This helper centralizes the import of appium-ios-remotexpc to:
 * - Provide consistent error handling across all services
 * - Give helpful installation instructions when the module is missing
 *
 * @returns The Services export from appium-ios-remotexpc
 * @throws {Error} If the module cannot be imported
 */
export async function getRemoteXPCServices(): Promise<typeof Services> {
  if (cachedRemoteXPCServices) {
    return cachedRemoteXPCServices;
  }

  try {
    const remotexpcModule = await import('appium-ios-remotexpc');
    cachedRemoteXPCServices = remotexpcModule.Services;
    return cachedRemoteXPCServices;
  } catch (err) {
    const error = err as Error;

    if (error.message.includes('Cannot find module')) {
      const version = remoteXpcVersion || '^0.x';
      throw new Error(
        'Failed to import appium-ios-remotexpc module. ' +
          'This module is required for iOS 18 and above device operations. ' +
          'Please install it by running: ' +
          `cd "${moduleRoot}" && npm install "appium-ios-remotexpc@${version}" ` +
          `Original error: ${error.message}`
      );
    }

    throw new Error(
      'Failed to import appium-ios-remotexpc module. ' +
        'This module is required for iOS 18 and above device operations. ' +
        `Original error: ${error.message}`
    );
  }
}
