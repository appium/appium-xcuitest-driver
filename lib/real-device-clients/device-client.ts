import type { BaseDeviceClient, BaseDeviceClientOptions } from './base-device-client';
import { Pyidevice } from './py-ios-device-client';
import { GoIos } from './go-ios-device-client';

export async function selectDeviceClient(options: BaseDeviceClientOptions & {udid: string}): Promise<BaseDeviceClient> {
  let lastError: Error | null = null;
  for (const client of [
    new Pyidevice(options),
    new GoIos(options),
  ]) {
    try {
      await client.assertExists(true);
      options.log.debug(`Selected ${client.constructor.name} real device client`);
      return client;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  if (lastError) {
    throw lastError;
  }
  // This must never happen
  throw new Error();
}
