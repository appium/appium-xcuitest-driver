import type {RemoteXPCServices} from './afc-client';

/**
 * Cached RemoteXPC Services module
 */
let cachedRemoteXPCServices: RemoteXPCServices | null = null;

/**
 * Get the RemoteXPC Services module dynamically
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
      throw new Error(
        'Failed to import appium-ios-remotexpc module. ' +
          'This module is required for iOS 18 and above device operations. ' +
          'Please ensure appium-ios-remotexpc is installed: ' +
          'npm install appium-ios-remotexpc. ' +
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

