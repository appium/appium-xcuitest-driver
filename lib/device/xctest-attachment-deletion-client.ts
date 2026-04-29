import type {AppiumLogger} from '@appium/types';
import {tryGetRemoteXPCModule} from './remotexpc-utils';
import {isIos18OrNewerPlatform} from '../utils';

const REMOTEXPC_UPGRADE_HINT =
  'Upgrade appium-ios-remotexpc to a version that exports XCTestAttachment ' +
  '(XCTest screen recording attachment deletion on real devices).';

/** Subset of appium-ios-remotexpc exports used here (types may lag the runtime package). */
export type RemotexpcAttachmentModule = {
  XCTestAttachment?: XCTestAttachmentCtor;
};

export interface IXctestAttachmentDeletionClient {
  deleteAttachmentsByUuid(uuids: string[]): Promise<void>;
}

type XCTestAttachmentCtor = new (udid: string) => {delete(uuids: string[]): Promise<unknown>};

/**
 * Deletes XCTest screen-recording attachments on a real device via appium-ios-remotexpc
 * (testmanagerd). Use {@link isDeletionAvailable} before start; {@link create} returns a client
 * ready to delete (or throws if deletion cannot run).
 */
export class XctestAttachmentDeletionClient implements IXctestAttachmentDeletionClient {
  private constructor(
    private readonly udid: string,
    private readonly XCTestAttachment: XCTestAttachmentCtor,
  ) {}

  /**
   * Whether attachment deletion can run: **iOS 18+**, **appium-ios-remotexpc** loadable, and
   * **XCTestAttachment** exported (new enough package).
   *
   * @param remotexpcModule - optional pre-loaded module (for unit tests)
   * @param log - if set, warns when the package is present but too old (no **XCTestAttachment** export)
   */
  static async isDeletionAvailable(
    udid: string,
    platformVersion: string,
    remotexpcModule?: RemotexpcAttachmentModule | null,
    log?: AppiumLogger,
  ): Promise<boolean> {
    if (!udid?.trim() || !isIos18OrNewerPlatform(platformVersion)) {
      return false;
    }
    let mod: RemotexpcAttachmentModule | null | undefined = remotexpcModule;
    if (mod === undefined) {
      mod = (await tryGetRemoteXPCModule()) as RemotexpcAttachmentModule | null;
      if (!mod) {
        return false;
      }
    }
    if (typeof mod?.XCTestAttachment === 'function') {
      return true;
    }
    if (mod && log) {
      log.warn(REMOTEXPC_UPGRADE_HINT);
    }
    return false;
  }

  /**
   * @param remotexpcModule - optional pre-loaded module (for unit tests)
   * @throws {Error} If real-device XCTest attachment deletion is not supported
   */
  static async create(
    udid: string,
    platformVersion: string,
    remotexpcModule?: RemotexpcAttachmentModule | null,
  ): Promise<XctestAttachmentDeletionClient> {
    if (!udid?.trim()) {
      throw new Error(
        'A device UDID is required for XCTest screen recording on a real device so attachments can be removed after stop.',
      );
    }
    if (!isIos18OrNewerPlatform(platformVersion)) {
      throw new Error(
        'XCTest screen recording on a real device requires iOS 18 or newer. ' +
          'The driver removes recordings from the device after stop using appium-ios-remotexpc, which is only supported on iOS 18+.',
      );
    }

    let mod: RemotexpcAttachmentModule | null | undefined = remotexpcModule;
    if (mod === undefined) {
      mod = (await tryGetRemoteXPCModule()) as RemotexpcAttachmentModule | null;
      if (!mod) {
        throw new Error(
          'appium-ios-remotexpc must be installed to use XCTest screen recording on a real device. ' +
            'It is used to delete screen-recording attachments after stop.',
        );
      }
    }

    const XCTestAttachment = mod?.XCTestAttachment;
    if (!mod || typeof XCTestAttachment !== 'function') {
      throw new Error(
        'The installed appium-ios-remotexpc package must export XCTestAttachment for real-device XCTest screen recording. ' +
          REMOTEXPC_UPGRADE_HINT,
      );
    }

    return new XctestAttachmentDeletionClient(
      udid.trim(),
      XCTestAttachment as XCTestAttachmentCtor,
    );
  }

  async deleteAttachmentsByUuid(uuids: string[]): Promise<void> {
    if (!uuids.length) {
      return;
    }
    const attachment = new this.XCTestAttachment(this.udid);
    await attachment.delete(uuids);
  }
}
