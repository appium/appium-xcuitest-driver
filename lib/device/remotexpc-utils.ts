import {node} from 'appium/support';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import type {AppiumLogger} from '@appium/types';
import type {Services, XCTestRunner} from 'appium-ios-remotexpc';
import {isDeviceListedInUsbmux} from './usbmux-utils';

export type RemoteXPCEsmModule = typeof import('appium-ios-remotexpc');

/**
 * Full ESM namespace after a successful `import('appium-ios-remotexpc')` (e.g. **XCTestAttachment**).
 * Set together with {@link cachedRemoteXPCServices}.
 */
let cachedRemoteXPCFullModule: RemoteXPCEsmModule | null = null;

/**
 * Cached RemoteXPC Services module
 */
let cachedRemoteXPCServices: typeof Services | null = null;

/**
 * Set when **appium-ios-remotexpc** resolution failed in a way that is unlikely to succeed on
 * retry in the same process (package not installed). Transient import errors do not set this.
 */
let remoteXpcModuleUnavailable = false;

/** Stored only when {@link remoteXpcModuleUnavailable} is set (missing-package case). */
let lastRemoteXpcImportError: Error | null = null;

/**
 * Most recent failed optional `import('appium-ios-remotexpc')` from {@link tryGetRemoteXPCServices}
 * (including full-module backfill). Cleared when an optional load succeeds.
 */
let lastTryGetRemoteXPCImportError: Error | null = null;

/**
 * Cached XCTestRunner class
 */
let cachedXCTestRunnerClass: typeof XCTestRunner | null = null;

/**
 * Module root and version cached at initialization
 */
const {moduleRoot, remoteXpcVersion} = fetchInstallInfo();

/**
 * Whether `err` indicates the **appium-ios-remotexpc** package is not installed / not resolvable,
 * as opposed to a transient or corrupt-install failure that may succeed on a later attempt.
 */
function isAppiumIosRemotexpcPackageMissingError(err: Error): boolean {
  const msg = err.message;
  return (
    (msg.includes('Cannot find module') && msg.includes('appium-ios-remotexpc')) ||
    (msg.includes('Cannot find package') && msg.includes('appium-ios-remotexpc'))
  );
}

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
    if (!cachedRemoteXPCFullModule) {
      try {
        cachedRemoteXPCFullModule = (await import('appium-ios-remotexpc')) as RemoteXPCEsmModule;
      } catch (err) {
        throwRemoteXPCImportError(err as Error);
      }
    }
    lastTryGetRemoteXPCImportError = null;
    return cachedRemoteXPCServices;
  }
  if (remoteXpcModuleUnavailable && lastRemoteXpcImportError) {
    throwRemoteXPCImportError(lastRemoteXpcImportError);
  }

  try {
    const remotexpcModule = (await import('appium-ios-remotexpc')) as RemoteXPCEsmModule;
    cachedRemoteXPCFullModule = remotexpcModule;
    cachedRemoteXPCServices = remotexpcModule.Services;
    lastTryGetRemoteXPCImportError = null;
    return cachedRemoteXPCServices;
  } catch (err) {
    throwRemoteXPCImportError(err as Error);
  }
}

/**
 * Try to load appium-ios-remotexpc without throwing (e.g. for optional features).
 * Successful loads share the same cache as {@link getRemoteXPCServices}.
 *
 * If the package is **not installed** (resolution error for **appium-ios-remotexpc**), subsequent
 * calls return `null` without re-importing. Other import failures are recorded via
 * {@link getLastRemoteXPCOptionalImportError} and **do not** permanently disable retries.
 */
export async function tryGetRemoteXPCServices(): Promise<typeof Services | null> {
  if (cachedRemoteXPCServices) {
    if (!cachedRemoteXPCFullModule) {
      try {
        cachedRemoteXPCFullModule = (await import('appium-ios-remotexpc')) as RemoteXPCEsmModule;
        lastTryGetRemoteXPCImportError = null;
      } catch (err) {
        lastTryGetRemoteXPCImportError = err as Error;
        /* ignore: tryGetRemoteXPCModule may still return null for XCTestAttachment callers */
      }
    } else {
      lastTryGetRemoteXPCImportError = null;
    }
    return cachedRemoteXPCServices;
  }
  if (remoteXpcModuleUnavailable) {
    return null;
  }

  try {
    const remotexpcModule = (await import('appium-ios-remotexpc')) as RemoteXPCEsmModule;
    cachedRemoteXPCFullModule = remotexpcModule;
    cachedRemoteXPCServices = remotexpcModule.Services;
    lastTryGetRemoteXPCImportError = null;
    return cachedRemoteXPCServices;
  } catch (err) {
    const error = err as Error;
    lastTryGetRemoteXPCImportError = error;
    if (isAppiumIosRemotexpcPackageMissingError(error)) {
      lastRemoteXpcImportError = error;
      remoteXpcModuleUnavailable = true;
    }
    return null;
  }
}

/**
 * Whether {@link tryGetRemoteXPCServices} has determined that **appium-ios-remotexpc** is not
 * installed (same process will not retry optional import).
 */
export function isRemoteXPCOptionalDependencyMissing(): boolean {
  return remoteXpcModuleUnavailable;
}

/**
 * Last error from an optional RemoteXPC `import()`, including transient failures. Cleared when a
 * load succeeds. When {@link isRemoteXPCOptionalDependencyMissing} is `true`, this matches the
 * stored missing-package error.
 */
export function getLastRemoteXPCOptionalImportError(): Error | null {
  return lastTryGetRemoteXPCImportError;
}

/**
 * Full **appium-ios-remotexpc** module after a successful optional load (same `import()` as
 * {@link tryGetRemoteXPCServices}). Returns `null` if the package is missing or failed to load.
 */
export async function tryGetRemoteXPCModule(): Promise<RemoteXPCEsmModule | null> {
  await tryGetRemoteXPCServices();
  return cachedRemoteXPCFullModule;
}

/**
 * Optional load of **appium-ios-remotexpc** (shared cache) plus the USBMUX vs tunnel branch hint:
 * whether `udid` appears in the usbmux device list. Used by lockdown and port forwarding so they
 * do not duplicate `import()` + {@link isDeviceListedInUsbmux}.
 *
 * @returns `null` if the module is not available; otherwise the module and whether to use the
 *   USBMUX-oriented APIs (`createLockdownServiceByUDID`, `connectViaUsbmux`, …).
 */
export async function tryGetRemotexpcUsbMuxStrategy(
  udid: string,
  log: AppiumLogger,
): Promise<{remotexpc: RemoteXPCEsmModule; useUsbMuxPath: boolean} | null> {
  const remotexpc = await tryGetRemoteXPCModule();
  if (!remotexpc) {
    return null;
  }
  const useUsbMuxPath = await isDeviceListedInUsbmux(remotexpc, udid, log);
  return {remotexpc, useUsbMuxPath};
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
  const remotexpcModule = cachedRemoteXPCFullModule;
  if (!remotexpcModule) {
    throw new Error(
      'appium-ios-remotexpc loaded Services but full module cache is missing; cannot load XCTestRunner.',
    );
  }
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
