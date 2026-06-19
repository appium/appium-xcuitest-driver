import type {RemoteXPCEsmModule} from './utils';

let cachedModule: RemoteXPCEsmModule | null = null;
let moduleUnavailable = false;
let lastImportError: Error | null = null;

/**
 * Optionally load **appium-ios-remotexpc** (process-wide cache).
 *
 * Returns `null` when the package is missing or failed to import. Missing-package failures are
 * cached for the remainder of the process; transient import errors may succeed on a later call.
 */
export async function tryLoadRemoteXPCModule(): Promise<RemoteXPCEsmModule | null> {
  if (cachedModule) {
    lastImportError = null;
    return cachedModule;
  }
  if (moduleUnavailable) {
    return null;
  }

  try {
    cachedModule = (await import('appium-ios-remotexpc')) as RemoteXPCEsmModule;
    lastImportError = null;
    return cachedModule;
  } catch (err) {
    const error = err as Error;
    lastImportError = error;
    if (isAppiumIosRemotexpcPackageMissingError(error)) {
      moduleUnavailable = true;
    }
    return null;
  }
}

/** Last failed optional `import('appium-ios-remotexpc')`; cleared when a load succeeds. */
export function getLastRemoteXPCImportError(): Error | null {
  return lastImportError;
}

function isAppiumIosRemotexpcPackageMissingError(err: Error): boolean {
  const msg = err.message;
  return (
    (msg.includes('Cannot find module') && msg.includes('appium-ios-remotexpc')) ||
    (msg.includes('Cannot find package') && msg.includes('appium-ios-remotexpc'))
  );
}
