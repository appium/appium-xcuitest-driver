import type {PasteboardService} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Pasteboard service on real hardware.
 *
 * Requires **iOS/tvOS 17+** and the optional **`appium-ios-remotexpc`** package.
 */
export class PasteboardClient {
  constructor(
    private readonly udid: string,
    private readonly remoteXPCFacade: RemoteXPCFacade,
  ) {}

  async setPasteboard(content: string, contentType?: string): Promise<void> {
    await this.withPasteboardService(async (pasteboardService) => {
      switch (contentType) {
        case 'image':
          await pasteboardService.setImage(Buffer.from(content, 'base64'));
          break;
        case 'url':
          await pasteboardService.setUrl(content);
          break;
        default:
          await pasteboardService.setText(content);
          break;
      }
    });
  }

  async getPasteboard(contentType?: string): Promise<string | undefined> {
    return await this.withPasteboardService(async (pasteboardService) => {
      switch (contentType) {
        case 'url': {
          const url = await pasteboardService.getUrl();
          return url === undefined ? undefined : url.toString();
        }
        case 'image': {
          const image = await pasteboardService.getImage();
          return image === undefined ? undefined : image.toString('base64');
        }
        default: {
          const text = await pasteboardService.getText();
          return text === undefined ? undefined : text;
        }
      }
    });
  }

  private async withPasteboardService<T>(operation: (pasteboardService: PasteboardService) => Promise<T>): Promise<T> {
    const pasteboardService = await this.remoteXPCFacade.requireService('Pasteboard', (Services) =>
      Services.startPasteboardService(this.udid),
    );
    try {
      return await operation(pasteboardService);
    } finally {
      await pasteboardService.close();
    }
  }
}
