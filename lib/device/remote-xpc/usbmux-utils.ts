import type {AppiumLogger} from '@appium/types';
import type * as RemoteXPCModule from 'appium-ios-remotexpc';

type RemotexpcUsbmuxModuleLike = Pick<typeof RemoteXPCModule, 'createUsbmux'>;

/**
 * Lists the UDIDs of the devices known to usbmuxd. A device attached over both USB and the network
 * is listed twice, so duplicates are removed.
 *
 * @throws When usbmuxd is unreachable
 */
export async function listUsbmuxUdids(remotexpc: RemotexpcUsbmuxModuleLike): Promise<string[]> {
  const usbmux = await remotexpc.createUsbmux();
  try {
    const udids = (await usbmux.listDevices()).map(({Properties}) => Properties?.SerialNumber).filter(Boolean);
    return [...new Set(udids)];
  } finally {
    await usbmux.close().catch(() => {});
  }
}

/**
 * Returns true when the given UDID is present in the usbmux device listing.
 * On any failure, logs and returns false so callers can fall back to another strategy.
 */
export async function isDeviceListedInUsbmux(
  remotexpc: RemotexpcUsbmuxModuleLike,
  udid: string,
  log?: AppiumLogger,
): Promise<boolean> {
  try {
    return (await listUsbmuxUdids(remotexpc)).some((x) => x.toLowerCase() === udid.toLowerCase());
  } catch (err) {
    log?.debug?.(`Failed to query usbmux devices for '${udid}': ${(err as Error).message}`);
    return false;
  }
}
