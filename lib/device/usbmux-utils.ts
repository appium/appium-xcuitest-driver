import type {AppiumLogger} from '@appium/types';

type RemotexpcUsbmuxModuleLike = Pick<typeof import('appium-ios-remotexpc'), 'createUsbmux'>;

/**
 * Returns true when the given UDID is present in usbmux device listing.
 */
export async function isDeviceListedInUsbmux(
  remotexpc: RemotexpcUsbmuxModuleLike,
  udid: string,
  log?: AppiumLogger,
): Promise<boolean> {
  const usbmux = await remotexpc.createUsbmux();
  try {
    const devices = await usbmux.listDevices();
    return devices.some((x) => x.Properties?.SerialNumber === udid);
  } catch (err) {
    log?.debug?.(`Failed to query usbmux devices for '${udid}': ${(err as Error).message}`);
    return false;
  } finally {
    await usbmux.close().catch(() => {});
  }
}
