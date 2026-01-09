import type {Readable, Writable} from 'stream';
import {Readable as ReadableStream} from 'stream';
import {services} from 'appium-ios-device';
import {getRemoteXPCServices} from './remotexpc-utils';

/**
 * Type definitions for RemoteXPC Services module
 */
export interface RemoteXPCServices {
  createRemoteXPCConnection(udid: string): Promise<{
    tunnelConnection: {host: string; port: number};
    remoteXPC: unknown;
  }>;
  startAfcService(udid: string): Promise<RemoteXPCAfcService>;
  startHouseArrestService(udid: string): Promise<{
    remoteXPC: unknown;
    houseArrestService: RemoteXPCHouseArrestService;
  }>;
}

/**
 * Type for RemoteXPC AFC service (appium-ios-remotexpc)
 */
export interface RemoteXPCAfcService {
  getFileContents(path: string): Promise<Buffer>;
  setFileContents(path: string, data: Buffer): Promise<void>;
  writeFromStream(path: string, stream: Readable): Promise<void>;
  isdir(path: string): Promise<boolean>;
  listdir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  rm(path: string, recursive: boolean): Promise<string[]>;
  pull(remotePath: string, localPath: string, options: AfcPullOptions): Promise<void>;
  close(): void;
}


export interface RemoteXPCHouseArrestService {
  vendDocuments(bundleId: string): Promise<RemoteXPCAfcService>;
  vendContainer(bundleId: string): Promise<RemoteXPCAfcService>;
}


export interface IOSDeviceAfcService {
  createReadStream(path: string, options?: {autoDestroy?: boolean}): Promise<Readable>;
  createWriteStream(path: string, options?: {autoDestroy?: boolean}): Promise<Writable>;
  getFileInfo(path: string): Promise<{isDirectory: () => boolean}>;
  listDirectory(path: string): Promise<string[]>;
  createDirectory(path: string): Promise<void>;
  deleteDirectory(path: string): Promise<void>;
  walkDir(
    path: string,
    recursive: boolean,
    callback: (path: string, isDir: boolean) => Promise<void>
  ): Promise<void>;
  close(): void;
}


/**
 * Options for pulling files/folders
 */
export interface AfcPullOptions {
  recursive?: boolean;
  overwrite?: boolean;
  callback?: (remotePath: string, localPath: string, isDirectory: boolean) => Promise<void>;
}

/**
 * Unified AFC Client
 *
 * Provides a unified interface for file operations on iOS devices,
 * automatically handling the differences between iOS < 18 (appium-ios-device)
 * and iOS 18 and above (appium-ios-remotexpc).
 */
export class AfcClient {
  private readonly service: RemoteXPCAfcService | IOSDeviceAfcService;
  private readonly isRemoteXPC: boolean;

  private constructor(service: RemoteXPCAfcService | IOSDeviceAfcService, isRemoteXPC: boolean) {
    this.service = service;
    this.isRemoteXPC = isRemoteXPC;
  }

  /**
   * Create an AFC client for device
   *
   * @param udid - Device UDID
   * @param useRemoteXPC - Whether to use remotexpc (use isIos18OrNewer(opts) to determine)
   * @returns AFC client instance
   */
  static async createForDevice(udid: string, useRemoteXPC: boolean): Promise<AfcClient> {
    if (useRemoteXPC) {
      const Services = await getRemoteXPCServices();
      await Services.createRemoteXPCConnection(udid);
      const afcService = await Services.startAfcService(udid);
      return new AfcClient(afcService, true);
    }

    const afcService = await services.startAfcService(udid);
    return new AfcClient(afcService, false);
  }

  /**
   * Create an AFC client for app container access
   *
   * @param udid - Device UDID
   * @param bundleId - App bundle identifier
   * @param containerType - Container type ('documents' for documents, null for app container)
   * @param useRemoteXPC - Whether to use remotexpc
   * @param skipDocumentsCheck - Skip checking for documents container (skipDocumentsContainerCheck setting)
   * @returns AFC client instance
   */
  static async createForApp(
    udid: string,
    bundleId: string,
    containerType: string | null,
    useRemoteXPC: boolean,
    skipDocumentsCheck: boolean = false
  ): Promise<AfcClient> {
    const isDocuments = !skipDocumentsCheck && containerType?.toLowerCase() === 'documents';

    if (useRemoteXPC) {
      const Services = await getRemoteXPCServices();
      await Services.createRemoteXPCConnection(udid);
      const {houseArrestService} = await Services.startHouseArrestService(udid);
      const afcService = isDocuments
        ? await houseArrestService.vendDocuments(bundleId)
        : await houseArrestService.vendContainer(bundleId);
      return new AfcClient(afcService, true);
    }

    const houseArrestService = await services.startHouseArrestService(udid);
    const afcService = isDocuments
      ? await houseArrestService.vendDocuments(bundleId)
      : await houseArrestService.vendContainer(bundleId);
    return new AfcClient(afcService, false);
  }

  /**
   * Check if a path is a directory
   */
  async isDirectory(path: string): Promise<boolean> {
    if (this.isRemoteXPC) {
      return await (this.service as RemoteXPCAfcService).isdir(path);
    }
    const fileInfo = await (this.service as IOSDeviceAfcService).getFileInfo(path);
    return fileInfo.isDirectory();
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<string[]> {
    if (this.isRemoteXPC) {
      return await (this.service as RemoteXPCAfcService).listdir(path);
    }
    return await (this.service as IOSDeviceAfcService).listDirectory(path);
  }

  /**
   * Create a directory
   */
  async createDirectory(path: string): Promise<void> {
    if (this.isRemoteXPC) {
      await (this.service as RemoteXPCAfcService).mkdir(path);
    } else {
      await (this.service as IOSDeviceAfcService).createDirectory(path);
    }
  }

  /**
   * Delete a directory or file
   */
  async deleteDirectory(path: string): Promise<void> {
    if (this.isRemoteXPC) {
      await (this.service as RemoteXPCAfcService).rm(path, true);
    } else {
      await (this.service as IOSDeviceAfcService).deleteDirectory(path);
    }
  }

  /**
   * Get file contents as a buffer
   */
  async getFileContents(path: string): Promise<Buffer> {
    if (this.isRemoteXPC) {
      return await (this.service as RemoteXPCAfcService).getFileContents(path);
    }

    // For ios-device, use stream-based approach
    const stream = await (this.service as IOSDeviceAfcService).createReadStream(path, {
      autoDestroy: true,
    });
    const buffers: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (data: Buffer) => buffers.push(data));
      stream.on('end', () => resolve(Buffer.concat(buffers)));
      stream.on('error', reject);
    });
  }

  /**
   * Set file contents from a buffer
   */
  async setFileContents(path: string, data: Buffer): Promise<void> {
    if (this.isRemoteXPC) {
      await (this.service as RemoteXPCAfcService).setFileContents(path, data);
    } else {
      // For ios-device, convert buffer to stream and use writeFromStream
      const bufferStream = ReadableStream.from([data]);
      return await this.writeFromStream(path, bufferStream);
    }
  }

  /**
   * Write file contents from a readable stream
   */
  async writeFromStream(path: string, stream: Readable): Promise<void> {
    if (this.isRemoteXPC) {
      await (this.service as RemoteXPCAfcService).writeFromStream(path, stream);
    } else {
      const writeStream = await (this.service as IOSDeviceAfcService).createWriteStream(path, {
        autoDestroy: true,
      });

      writeStream.on('finish', (writeStream as any).destroy);

      return new Promise((resolve, reject) => {
        writeStream.on('close', resolve);
        const onError = (e: Error) => {
          stream.unpipe(writeStream);
          reject(e);
        };
        writeStream.on('error', onError);
        stream.on('error', onError);
        stream.pipe(writeStream);
      });
    }
  }

  /**
   * Create a read stream for a file
   */
  async createReadStream(path: string, options?: {autoDestroy?: boolean}): Promise<Readable> {
    if (this.isRemoteXPC) {
      // RemoteXPC doesn't expose createReadStream directly; use getFileContents with a stream wrapper
      const buffer = await (this.service as RemoteXPCAfcService).getFileContents(path);
      return ReadableStream.from(buffer);
    }
    return await (this.service as IOSDeviceAfcService).createReadStream(path, options);
  }

  /**
   * Create a write stream for a file
   */
  async createWriteStream(path: string, options?: {autoDestroy?: boolean}): Promise<Writable> {
    if (this.isRemoteXPC) {
      throw new Error('RemoteXPC AFC service does not support createWriteStream directly. Use setFileContents or writeFromStream instead.');
    }
    return await (this.service as IOSDeviceAfcService).createWriteStream(path, options);
  }

  /**
   * Walk a directory tree (iOS < 18 only)
   */
  async walkDir(
    path: string,
    recursive: boolean,
    onEntry: (path: string, isDir: boolean) => Promise<void>
  ): Promise<void> {
    if (this.isRemoteXPC) {
      throw new Error('RemoteXPC AFC service uses pull() method for recursive operations.');
    }
    return await (this.service as IOSDeviceAfcService).walkDir(path, recursive, onEntry);
  }

  /**
   * Pull files/folders from device to local filesystem (iOS 18 and above only)
   */
  async pull(
    remotePath: string,
    localPath: string,
    options: AfcPullOptions
  ): Promise<void> {
    if (this.isRemoteXPC) {
      await (this.service as RemoteXPCAfcService).pull(remotePath, localPath, options);
    } else {
      throw new Error('iOS Device AFC service uses walkDir() method for recursive operations.');
    }
  }

  /**
   * Close the AFC service connection
   */
  close(): void {
    this.service.close();
  }

  /**
   * Check if this is using RemoteXPC
   */
  isUsingRemoteXPC(): boolean {
    return this.isRemoteXPC;
  }
}
