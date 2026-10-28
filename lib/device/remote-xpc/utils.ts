import type * as RemoteXPCModule from 'appium-ios-remotexpc';

import {supportsApiLevel18} from '../../utils/index.js';

export type RemoteXPCEsmModule = typeof RemoteXPCModule;
export type RemoteXPCServices = RemoteXPCEsmModule['Services'];
export type RemoteXPCTestRunner = RemoteXPCEsmModule['XCTestRunner'];
export type RemoteXPCTestAttachment = RemoteXPCEsmModule['XCTestAttachment'];

/** Published driver guide for Remote XPC tunnel setup on real devices (iOS/tvOS 18+). */
export const REMOTE_XPC_TUNNEL_SETUP_DOC_LINK =
  'https://appium.github.io/appium-xcuitest-driver/latest/guides/remotexpc-tunnels-real-devices/';

/** Driver script that starts the tunnel registry (must run with sudo/root). */
export const TUNNEL_CREATION_COMMAND = 'sudo appium driver run xcuitest tunnel-creation';

/** Which transport serves RemoteXPC services in a session: the tunnel (preferred) or the temporary usbmux fallback. */
export type TransportTier = 'tunnel' | 'usbmux';

/**
 * A feature needs the RemoteXPC tunnel, but the session runs without one
 * (on the temporary usbmux fallback).
 */
export class TunnelRequiredError extends Error {
  /** Matches {@link isTunnelAvailabilityError}, so callers handling missing tunnels treat this the same way */
  readonly code = 'ERR_TUNNEL_AVAILABILITY';

  constructor(feature: string, udid: string, platformVersion?: string) {
    super(
      platformVersion && !supportsApiLevel18(platformVersion)
        ? `${feature} is not supported for '${udid}' on iOS/tvOS ${platformVersion}: it requires a RemoteXPC ` +
            `tunnel, which is only available on iOS/tvOS 18 or newer`
        : `${feature} requires a RemoteXPC tunnel for '${udid}', but none is available. ` +
            `Start tunnels with \`${TUNNEL_CREATION_COMMAND}\` (requires root). See ${REMOTE_XPC_TUNNEL_SETUP_DOC_LINK}`,
    );
    this.name = 'TunnelRequiredError';
  }
}

/** Whether `err` is a {@link TunnelRequiredError}. */
export function isTunnelRequiredError(err: unknown): err is TunnelRequiredError {
  return err instanceof TunnelRequiredError;
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
  if (err instanceof TunnelRequiredError) {
    // already carries its own (version-aware) guidance
    return err.message;
  }
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
