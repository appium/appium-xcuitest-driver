import {node} from 'appium/support';
import type {RemoteXPCServices} from './remotexpc-types';

/**
 * Cached RemoteXPC Services module
 */
let cachedRemoteXPCServices: RemoteXPCServices | null = null;

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
export async function getRemoteXPCServices(): Promise<RemoteXPCServices> {
  if (cachedRemoteXPCServices) {
    return cachedRemoteXPCServices;
  }

  try {
    const remotexpcModule = await import('appium-ios-remotexpc');
    cachedRemoteXPCServices = remotexpcModule.Services as unknown as RemoteXPCServices;
    return cachedRemoteXPCServices;
  } catch (err) {
    const error = err as Error;

    if (error.message.includes('Cannot find module')) {
      const moduleRoot = node.getModuleRootSync('appium-xcuitest-driver', __filename);
      throw new Error(
        'Failed to import appium-ios-remotexpc module. ' +
          'This module is required for iOS 18 and above device operations. ' +
          'Please install it by running: ' +
          `cd "${moduleRoot}" && npm install appium-ios-remotexpc@^0.x. ` +
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
