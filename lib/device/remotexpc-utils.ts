import {node} from 'appium/support';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import type {Services, XCTestRunner} from 'appium-ios-remotexpc';

type RemotexpcEsmModule = typeof import('appium-ios-remotexpc');

/**
 * Full ESM namespace after a successful `import('appium-ios-remotexpc')` (e.g. **XCTestAttachment**).
 * Set together with {@link cachedRemoteXPCServices}.
 */
let cachedRemotexpcFullModule: RemotexpcEsmModule | null = null;

/**
 * Cached RemoteXPC Services module
 */
let cachedRemoteXPCServices: typeof Services | null = null;

/**
 * When a prior optional import failed, avoid repeating `import()` on every call.
 */
let remoteXpcModuleUnavailable = false;

let lastRemoteXpcImportError: Error | null = null;

/**
 * Cached XCTestRunner class
 */
let cachedXCTestRunnerClass: typeof XCTestRunner | null = null;

/**
 * Module root and version cached at initialization
 */
const {moduleRoot, remoteXpcVersion} = fetchInstallInfo();

function throwRemoteXPCImportError(err: Error): never {
  if (err.message.includes('Cannot find module')) {
    let errorMessage =
      'Failed to import appium-ios-remotexpc module. ' +
      'This module is required for iOS 18 and above device operations.';

    if (moduleRoot && remoteXpcVersion) {
      errorMessage +=
        ' Please install it by running: ' +
        `cd "${moduleRoot}" && npm install "appium-ios-remotexpc@${remoteXpcVersion}".`;
    }

    errorMessage += ` Original error: ${err.message}`;
    throw new Error(errorMessage);
  }

  throw new Error(
    'Failed to import appium-ios-remotexpc module. ' +
      'This module is required for iOS 18 and above device operations. ' +
      `Original error: ${err.message}`,
  );
}

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
    if (!cachedRemotexpcFullModule) {
      try {
        cachedRemotexpcFullModule = (await import('appium-ios-remotexpc')) as RemotexpcEsmModule;
      } catch (err) {
        throwRemoteXPCImportError(err as Error);
      }
    }
    return cachedRemoteXPCServices;
  }
  if (remoteXpcModuleUnavailable && lastRemoteXpcImportError) {
    throwRemoteXPCImportError(lastRemoteXpcImportError);
  }

  try {
    const remotexpcModule = (await import('appium-ios-remotexpc')) as RemotexpcEsmModule;
    cachedRemotexpcFullModule = remotexpcModule;
    cachedRemoteXPCServices = remotexpcModule.Services;
    return cachedRemoteXPCServices;
  } catch (err) {
    throwRemoteXPCImportError(err as Error);
  }
}

/**
 * Try to load appium-ios-remotexpc without throwing (e.g. for optional features).
 * Successful loads share the same cache as {@link getRemoteXPCServices}.
 */
export async function tryGetRemoteXPCServices(): Promise<typeof Services | null> {
  if (cachedRemoteXPCServices) {
    if (!cachedRemotexpcFullModule) {
      try {
        cachedRemotexpcFullModule = (await import('appium-ios-remotexpc')) as RemotexpcEsmModule;
      } catch {
        /* ignore: tryGetRemotexpcModule may still return null for XCTestAttachment callers */
      }
    }
    return cachedRemoteXPCServices;
  }
  if (remoteXpcModuleUnavailable) {
    return null;
  }

  try {
    const remotexpcModule = (await import('appium-ios-remotexpc')) as RemotexpcEsmModule;
    cachedRemotexpcFullModule = remotexpcModule;
    cachedRemoteXPCServices = remotexpcModule.Services;
    return cachedRemoteXPCServices;
  } catch (err) {
    lastRemoteXpcImportError = err as Error;
    remoteXpcModuleUnavailable = true;
    return null;
  }
}

/**
 * Full **appium-ios-remotexpc** module after a successful optional load (same `import()` as
 * {@link tryGetRemoteXPCServices}). Returns `null` if the package is missing or failed to load.
 */
export async function tryGetRemotexpcModule(): Promise<RemotexpcEsmModule | null> {
  await tryGetRemoteXPCServices();
  return cachedRemotexpcFullModule;
}

/**
 * Get the XCTestRunner class dynamically from appium-ios-remotexpc
 *
 * @returns The XCTestRunner class
 * @throws {Error} If the module cannot be imported
 */
export async function getXCTestRunnerClass(): Promise<typeof XCTestRunner> {
  if (cachedXCTestRunnerClass) {
    return cachedXCTestRunnerClass;
  }

  await getRemoteXPCServices();
  const remotexpcModule = cachedRemotexpcFullModule!;
  try {
    const XCTestRunnerClass = remotexpcModule.XCTestRunner;
    if (typeof XCTestRunnerClass !== 'function') {
      throw new Error(
        'XCTestRunner is not exported from appium-ios-remotexpc. ' +
          'The installed version may be incompatible.',
      );
    }
    cachedXCTestRunnerClass = XCTestRunnerClass;
    return cachedXCTestRunnerClass;
  } catch (err) {
    const error = err as Error;
    throw new Error(
      'Failed to import XCTestRunner from appium-ios-remotexpc. ' +
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
