import type {RemoteXPCFacade} from './remote-xpc/index.js';

export interface IXctestAttachmentDeletionClient {
  deleteAttachmentsByUuid(uuids: string[]): Promise<void>;
}

/**
 * Deletes XCTest screen-recording attachments on a real device via appium-ios-remotexpc
 * (testmanagerd).
 */
export class XctestAttachmentDeletionClient implements IXctestAttachmentDeletionClient {
  constructor(private readonly facade: RemoteXPCFacade) {}

  async deleteAttachmentsByUuid(uuids: string[]): Promise<void> {
    if (!uuids.length) {
      return;
    }
    const XCTestAttachment = await this.facade.getXCTestAttachment();
    const attachment = new XCTestAttachment(this.facade.udid);
    await attachment.delete(uuids);
  }
}
