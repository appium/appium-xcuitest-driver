import type * as RemoteXPCModule from 'appium-ios-remotexpc';

export type RemoteXPCEsmModule = typeof RemoteXPCModule;
export type RemoteXPCServices = RemoteXPCEsmModule['Services'];
export type RemoteXPCTestRunner = RemoteXPCEsmModule['XCTestRunner'];
export type RemoteXPCTestAttachment = RemoteXPCEsmModule['XCTestAttachment'];

/** Published driver guide for Remote XPC tunnel setup on real devices (iOS/tvOS 18+). */
export const REMOTE_XPC_TUNNEL_SETUP_DOC_LINK =
  'https://appium.github.io/appium-xcuitest-driver/latest/guides/remotexpc-tunnels-real-devices/';

/** Driver script that starts the tunnel registry (must run with sudo/root). */
export const TUNNEL_CREATION_COMMAND = 'sudo appium driver run xcuitest tunnel-creation';

/**
 * RemoteXPC cannot satisfy the request in a way the caller may handle without treating it as
 * a hard tunnel/connectivity failure (for example module missing or session ineligible).
 */
export class RemoteXPCUnavailableError extends Error {
  constructor(message = 'RemoteXPC is not available') {
    super(message);
    this.name = 'RemoteXPCUnavailableError';
  }
}

/** Whether `err` is a {@link RemoteXPCUnavailableError}. */
export function isRemoteXPCUnavailableError(err: unknown): boolean {
  return err instanceof RemoteXPCUnavailableError;
}

/**
 * Whether the given error means RemoteXPC tunnel infrastructure is unavailable.
 */
export function isTunnelAvailabilityError(err: unknown): boolean {
  if (!err) {
    return false;
  }
  const candidate = err as {name?: string; code?: string; constructor?: {name?: string}};
  if (candidate.code === 'ERR_TUNNEL_AVAILABILITY') {
    return true;
  }
  const name = candidate.name ?? candidate.constructor?.name;
  return name === 'TunnelAvailabilityError';
}

/**
 * User-facing message for tunnel registry / tunnel-entry failures from appium-ios-remotexpc.
 */
export function formatTunnelAvailabilityMessage(err: unknown): string {
  let detail: string;
  if (err instanceof Error) {
    detail = err.message;
  } else if (typeof err === 'string') {
    detail = err;
  } else {
    detail = String(err);
  }
  const normalizedDetail = detail.toLowerCase();
  const alreadySuggestsTunnelScript = normalizedDetail.includes('tunnel creation script');
  const setupHint = alreadySuggestsTunnelScript
    ? ''
    : ` Start tunnels with \`${TUNNEL_CREATION_COMMAND}\` (requires root).`;
  return `${detail}${setupHint} See ${REMOTE_XPC_TUNNEL_SETUP_DOC_LINK}`;
}

/**
 * Wraps a RemoteXPC connection error with tunnel setup guidance when the cause is tunnel-related.
 */
export function wrapRemoteXPCConnectionError(err: unknown, context: string): Error {
  if (isTunnelAvailabilityError(err)) {
    return new Error(`${context} (${formatTunnelAvailabilityMessage(err)})`, {cause: err});
  }
  const detail = err instanceof Error ? err.message : String(err);
  return new Error(`${context} (${detail})`, {cause: err});
}

/**
 * Log line when an optional RemoteXPC feature falls back after a connection failure.
 */
export function formatRemoteXPCFallbackLog(feature: string, err: unknown): string {
  const legacyNote = 'Falling back to appium-ios-device.';
  if (isTunnelAvailabilityError(err)) {
    return `RemoteXPC ${feature} unavailable: ${formatTunnelAvailabilityMessage(err)} ${legacyNote}`;
  }
  const detail = err instanceof Error ? err.message : String(err);
  return `Failed ${feature} via RemoteXPC: ${detail}. ${legacyNote}`;
}
