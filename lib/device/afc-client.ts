import type {Readable} from 'node:stream';

import type {AfcService as RemoteXPCAfcService} from 'appium-ios-remotexpc';

import type {RemoteXPCFacade} from './remote-xpc/index.js';

/**
 * Options for pulling files/folders
 */
export interface AfcPullOptions {
  recursive?: boolean;
  overwrite?: boolean;
  onEntry?: (remotePath: string, localPath: string, isDirectory: boolean) => Promise<void>;
}

/**
 * Options for creating an AFC client for app container access
 */
export interface CreateForAppOptions {
  containerType?: string | null;
  skipDocumentsCheck?: boolean;
}

/**
 * AFC Client
 *
 * Provides a file operations interface for iOS devices on top of appium-ios-remotexpc.
 */
export class AfcClient {
  private constructor(private readonly service: RemoteXPCAfcService) {}

  /**
   * Create an AFC client for device
   *
   * @param udid - Device UDID
   * @param facade - RemoteXPC facade of the session
   * @returns AFC client instance
   */
  static async createForDevice(udid: string, facade: RemoteXPCFacade): Promise<AfcClient> {
    const service = await facade.requireService('AFC', (Services, options) => Services.startAfcService(udid, options));
    return new AfcClient(service);
  }

  /**
   * Create an AFC client for app container access
   *
   * @param udid - Device UDID
   * @param bundleId - App bundle identifier
   * @param facade - RemoteXPC facade of the session
   * @param options - Optional configuration for container access
   * @returns AFC client instance
   */
  static async createForApp(
    udid: string,
    bundleId: string,
    facade: RemoteXPCFacade,
    options?: CreateForAppOptions,
  ): Promise<AfcClient> {
    const {containerType = null, skipDocumentsCheck = false} = options ?? {};
    const isDocuments = !skipDocumentsCheck && containerType?.toLowerCase() === 'documents';

    const service = await facade.requireService('AFC', async (Services, serviceOptions) => {
      const houseArrestService = await Services.startHouseArrestService(udid, serviceOptions);
      return isDocuments
        ? await houseArrestService.vendDocuments(bundleId)
        : await houseArrestService.vendContainer(bundleId);
    });
    return new AfcClient(service);
  }

  /**
   * Check if a path is a directory
   */
  async isDirectory(path: string): Promise<boolean> {
    return await this.service.isdir(path);
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<string[]> {
    return await this.service.listdir(path);
  }

  /**
   * Create a directory
   */
  async createDirectory(path: string): Promise<void> {
    await this.service.mkdir(path);
  }

  /**
   * Delete a directory or file
   *
   * @throws If the path does not exist (message contains `OBJECT_NOT_FOUND`) or cannot be fully removed
   */
  async deleteDirectory(path: string): Promise<void> {
    // rm() with force silently succeeds for missing paths, while stat() reports the actual AFC error
    // (OBJECT_NOT_FOUND, PERM_DENIED, ...), unlike exists() that maps every failure to `false`
    await this.service.stat(path);
    const failedPaths = await this.service.rm(path, true);
    if (failedPaths.length > 0) {
      throw new Error(`Cannot delete the following paths on the device: ${failedPaths.join(', ')}`);
    }
  }

  /**
   * Get file contents as a buffer
   */
  async getFileContents(path: string): Promise<Buffer> {
    return await this.service.getFileContents(path);
  }

  /**
   * Set file contents from a buffer
   */
  async setFileContents(path: string, data: Buffer): Promise<void> {
    await this.service.setFileContents(path, data);
  }

  /**
   * Write file contents from a readable stream
   */
  async writeFromStream(path: string, stream: Readable): Promise<void> {
    await this.service.writeFromStream(path, stream);
  }

  /**
   * Pull files/folders from device to local filesystem.
   *
   * @param remotePath - Remote path on the device (file or directory)
   * @param localPath - Local destination path
   * @param options - Pull options (recursive, overwrite, onEntry)
   */
  async pull(remotePath: string, localPath: string, options: AfcPullOptions = {}): Promise<void> {
    // RemoteXPC expects 'callback' property, so map onEntry -> callback
    const remoteXpcOptions = {
      ...options,
      callback: options.onEntry,
    };
    delete remoteXpcOptions.onEntry;
    await this.service.pull(remotePath, localPath, remoteXpcOptions);
  }

  /**
   * Close the AFC service connection
   */
  async close(): Promise<void> {
    this.service.close();
  }
}
