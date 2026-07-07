import type {HidButtonName, HidButtonPressOptions, HidIndigoService} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from './remote-xpc';

/**
 * HID Indigo service on real hardware.
 *
 * Requires **iOS/tvOS 26+** and the optional **`appium-ios-remotexpc`** package.
 */
export class HidIndigoClient {
  constructor(
    private readonly udid: string,
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  async pressButtonByName(name: HidButtonName, options?: HidButtonPressOptions): Promise<void> {
    await this.withHidIndigoService((hidIndigoService) => hidIndigoService.pressButton(name, options));
  }

  async pressButtonByPageAndUsage(
    usagePage: number,
    usageCode: number,
    options?: HidButtonPressOptions,
  ): Promise<void> {
    await this.withHidIndigoService((hidIndigoService) => hidIndigoService.pressButton(usagePage, usageCode, options));
  }

  private async withHidIndigoService(operation: (hidIndigoService: HidIndigoService) => Promise<void>): Promise<void> {
    const hidIndigoService = await this.remoteXPCFacade.requireService('HID Indigo', (Services) =>
      Services.startHidIndigoService(this.udid),
    );
    try {
      await operation(hidIndigoService);
    } finally {
      await hidIndigoService.close();
    }
  }
}
