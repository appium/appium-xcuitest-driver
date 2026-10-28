import type {RemoteXPCEsmModule} from './utils.js';

let cachedModule: RemoteXPCEsmModule | null = null;

/**
 * Lazily imports (and caches) **appium-ios-remotexpc**, so that sessions not using it never load it.
 *
 * @throws When the package cannot be imported
 */
export async function loadRemoteXPCModule(): Promise<RemoteXPCEsmModule> {
  cachedModule ??= (await import('appium-ios-remotexpc')) as RemoteXPCEsmModule;
  return cachedModule;
}
