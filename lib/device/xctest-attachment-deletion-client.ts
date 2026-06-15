import type {RemoteXPCFacade} from './remote-xpc';

export interface IXctestAttachmentDeletionClient {
  deleteAttachmentsByUuid(uuids: string[]): Promise<void>;
}

/**
 * Deletes XCTest screen-recording attachments on a real device via appium-ios-remotexpc
 * (testmanagerd). Call {@link RemoteXPCFacade.shouldUseRemoteXPC} before start;
 * {@link create} returns a client ready to delete (or throws if deletion cannot run).
 */
export class XctestAttachmentDeletionClient implements IXctestAttachmentDeletionClient {
  private constructor(private readonly facade: RemoteXPCFacade) {}

  /**
   * @throws {Error} If real-device XCTest attachment deletion is not supported
   */
  static async create(facade: RemoteXPCFacade | null): Promise<XctestAttachmentDeletionClient> {
    if (!facade?.udid.trim()) {
      throw new Error(
        'A device UDID is required for XCTest screen recording on a real device so attachments can be removed after stop.',
      );
    }
    if (!facade.eligible) {
      throw new Error(
        'XCTest screen recording on a real device requires iOS 18 or newer. ' +
          'The driver removes recordings from the device after stop using appium-ios-remotexpc, which is only supported on iOS 18+.',
      );
    }

    if (!(await facade.shouldUseRemoteXPC())) {
      throw new Error(
        'appium-ios-remotexpc must be installed to use XCTest screen recording on a real device. ' +
          'It is used to delete screen-recording attachments after stop.',
      );
    }

    return new XctestAttachmentDeletionClient(facade);
  }

  async deleteAttachmentsByUuid(uuids: string[]): Promise<void> {
    if (!uuids.length) {
      return;
    }
    const XCTestAttachment = await this.facade.getXCTestAttachment();
    const attachment = new XCTestAttachment(this.facade.udid);
    await attachment.delete(uuids);
  }
}
