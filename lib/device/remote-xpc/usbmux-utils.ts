import type {AppiumLogger} from '@appium/types';
import type {Usbmux} from 'appium-ios-remotexpc';
import type * as RemoteXPCModule from 'appium-ios-remotexpc';

type RemotexpcUsbmuxModuleLike = Pick<typeof RemoteXPCModule, 'createUsbmux'>;

/**
 * Returns true when the given UDID is present in usbmux device listing.
 * On any failure (including failing to create the usbmux client), logs and returns false so callers can
 * fall back to another strategy.
 */
export async function isDeviceListedInUsbmux(
  remotexpc: RemotexpcUsbmuxModuleLike,
  udid: string,
  log?: AppiumLogger,
): Promise<boolean> {
  let usbmux: Usbmux | undefined;
  try {
    usbmux = await remotexpc.createUsbmux();
    const devices = await usbmux.listDevices();
    return devices.some((x) => x.Properties?.SerialNumber === udid);
  } catch (err) {
    log?.debug?.(`Failed to query usbmux devices for '${udid}': ${(err as Error).message}`);
    return false;
  } finally {
    if (usbmux) {
      await usbmux.close().catch(() => {});
    }
  }
}
