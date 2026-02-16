import {node} from 'appium/support';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import type {Services} from 'appium-ios-remotexpc';

/**
 * Cached RemoteXPC Services module
 */
let cachedRemoteXPCServices: typeof Services | null = null;

/**
 * Module root and version cached at initialization
 */
const {moduleRoot, remoteXpcVersion} = fetchInstallInfo();

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
      let errorMessage =
        'Failed to import appium-ios-remotexpc module. ' +
        'This module is required for iOS 18 and above device operations.';

      if (moduleRoot && remoteXpcVersion) {
        errorMessage +=
          ' Please install it by running: ' +
          `cd "${moduleRoot}" && npm install "appium-ios-remotexpc@${remoteXpcVersion}".`;
      }

      errorMessage += ` Original error: ${error.message}`;
      throw new Error(errorMessage);
    }

    throw new Error(
      'Failed to import appium-ios-remotexpc module. ' +
        'This module is required for iOS 18 and above device operations. ' +
        `Original error: ${error.message}`,
    );
  }
}

/**
 * Fetch module root and appium-ios-remotexpc version from package.json
 *
 * @returns Object containing moduleRoot and remoteXpcVersion
 */
function fetchInstallInfo(): {
  moduleRoot: string | undefined;
  remoteXpcVersion: string | undefined;
} {
  try {
    const root = node.getModuleRootSync('appium-xcuitest-driver', __filename);
    if (root) {
      const packageJsonPath = path.join(root, 'package.json');
      const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
      if (packageJsonContent) {
        const packageJson = JSON.parse(packageJsonContent);
        return {
          moduleRoot: root,
          remoteXpcVersion: packageJson.optionalDependencies?.['appium-ios-remotexpc'],
        };
      }
    }
  } catch {
    // Error messages will skip install hints
  }

  return {moduleRoot: undefined, remoteXpcVersion: undefined};
}
