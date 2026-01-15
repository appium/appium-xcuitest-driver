import type {Readable, Writable} from 'stream';
import {Readable as ReadableStream} from 'stream';
import {pipeline} from 'stream/promises';
import path from 'path';
import {fs, mkdirp} from 'appium/support';
import {services} from 'appium-ios-device';
import {getRemoteXPCServices} from './remotexpc-utils';
import {log} from '../logger';

/**
 * RemoteXPC connection interface
 */
export interface RemoteXPCConnection {
  close(): Promise<void>;
}

/**
 * Type for RemoteXPC AFC service (appium-ios-remotexpc)
 */
export interface RemoteXPCAfcService {
  getFileContents(path: string): Promise<Buffer>;
  setFileContents(path: string, data: Buffer): Promise<void>;
  writeFromStream(path: string, stream: Readable): Promise<void>;
  readToStream(path: string): Promise<Readable>;
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
 * Options for creating an AFC client for app container access
 */
export interface CreateForAppOptions {
  containerType?: string | null;
  skipDocumentsCheck?: boolean;
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
  private readonly remoteXPCConnection?: RemoteXPCConnection;

  private constructor(
    service: RemoteXPCAfcService | IOSDeviceAfcService,
    isRemoteXPC: boolean,
    remoteXPCConnection?: RemoteXPCConnection
  ) {
    this.service = service;
    this.isRemoteXPC = isRemoteXPC;
    this.remoteXPCConnection = remoteXPCConnection;
  }

  /**
   * Get service as RemoteXPC AFC service
   */
  private get remoteXPCAfcService(): RemoteXPCAfcService {
    return this.service as RemoteXPCAfcService;
  }

  /**
   * Get service as iOS Device AFC service
   */
  private get iosDeviceAfcService(): IOSDeviceAfcService {
    return this.service as IOSDeviceAfcService;
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
      let remoteXPCConnection;
      let succeeded = false;
      try {
        const Services = await getRemoteXPCServices();
        const connectionResult = await Services.createRemoteXPCConnection(udid);
        remoteXPCConnection = connectionResult.remoteXPC;
        const afcService = await Services.startAfcService(udid);
        const client = new AfcClient(afcService, true, remoteXPCConnection);
        succeeded = true;
        return client;
      } catch (err: any) {
        log.error(`Failed to create AFC client via RemoteXPC: ${err.message}, falling back to appium-ios-device`);
      } finally {
        // Only close connection if we failed (if succeeded, the client owns it)
        if (remoteXPCConnection && !succeeded) {
          try {
            await remoteXPCConnection.close();
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    const afcService = await services.startAfcService(udid);
    return new AfcClient(afcService, false);
  }

  /**
   * Create an AFC client for app container access
   *
   * @param udid - Device UDID
   * @param bundleId - App bundle identifier
   * @param useRemoteXPC - Whether to use remotexpc (use isIos18OrNewer(opts) to determine)
   * @param options - Optional configuration for container access
   * @returns AFC client instance
   */
  static async createForApp(
    udid: string,
    bundleId: string,
    useRemoteXPC: boolean,
    options?: CreateForAppOptions
  ): Promise<AfcClient> {
    const {containerType = null, skipDocumentsCheck = false} = options ?? {};
    const isDocuments = !skipDocumentsCheck && containerType?.toLowerCase() === 'documents';

    if (useRemoteXPC) {
      let remoteXPCConnection;
      let succeeded = false;
      try {
        const Services = await getRemoteXPCServices();
        const connectionResult = await Services.createRemoteXPCConnection(udid);
        remoteXPCConnection = connectionResult.remoteXPC;
        const {houseArrestService, remoteXPC: houseArrestRemoteXPC} = await Services.startHouseArrestService(udid);
        // Use the remoteXPC from house arrest service if available, otherwise use the one from connection
        remoteXPCConnection = houseArrestRemoteXPC || remoteXPCConnection;
        const afcService = isDocuments
          ? await houseArrestService.vendDocuments(bundleId)
          : await houseArrestService.vendContainer(bundleId);
        const client = new AfcClient(afcService, true, remoteXPCConnection);
        succeeded = true;
        return client;
      } catch (err: any) {
        log.error(`Failed to create AFC client for app via RemoteXPC: ${err.message}, falling back to appium-ios-device`);
      } finally {
        if (remoteXPCConnection && !succeeded) {
          try {
            await remoteXPCConnection.close();
          } catch {
            // Ignore cleanup errors
          }
        }
      }
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
      return await this.remoteXPCAfcService.isdir(path);
    }
    const fileInfo = await this.iosDeviceAfcService.getFileInfo(path);
    return fileInfo.isDirectory();
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string): Promise<string[]> {
    if (this.isRemoteXPC) {
      return await this.remoteXPCAfcService.listdir(path);
    }
    return await this.iosDeviceAfcService.listDirectory(path);
  }

  /**
   * Create a directory
   */
  async createDirectory(path: string): Promise<void> {
    if (this.isRemoteXPC) {
      await this.remoteXPCAfcService.mkdir(path);
    } else {
      await this.iosDeviceAfcService.createDirectory(path);
    }
  }

  /**
   * Delete a directory or file
   */
  async deleteDirectory(path: string): Promise<void> {
    if (this.isRemoteXPC) {
      await this.remoteXPCAfcService.rm(path, true);
    } else {
      await this.iosDeviceAfcService.deleteDirectory(path);
    }
  }

  /**
   * Get file contents as a buffer
   */
  async getFileContents(path: string): Promise<Buffer> {
    if (this.isRemoteXPC) {
      return await this.remoteXPCAfcService.getFileContents(path);
    }

    // For ios-device, use stream-based approach
    const stream = await this.iosDeviceAfcService.createReadStream(path, {
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
      await this.remoteXPCAfcService.setFileContents(path, data);
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
      await this.remoteXPCAfcService.writeFromStream(path, stream);
    } else {
      const writeStream = await this.iosDeviceAfcService.createWriteStream(path, {
        autoDestroy: true,
      });

      writeStream.on('finish', () => {
        if (typeof writeStream.destroy === 'function') {
          writeStream.destroy();
        }
      });

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
   * Create a read stream for a file.
   */
  async createReadStream(remotePath: string, options?: {autoDestroy?: boolean}): Promise<Readable> {
    if (this.isRemoteXPC) {
      // Use readToStream which returns a streaming Readable
      return await this.remoteXPCAfcService.readToStream(remotePath);
    }
    return await this.iosDeviceAfcService.createReadStream(remotePath, options);
  }

  /**
   * Create a write stream for a file
   */
  async createWriteStream(path: string, options?: {autoDestroy?: boolean}): Promise<Writable> {
    if (this.isRemoteXPC) {
      throw new Error('RemoteXPC AFC service does not support createWriteStream directly. Use setFileContents or writeFromStream instead.');
    }
    return await this.iosDeviceAfcService.createWriteStream(path, options);
  }

  /**
   * Pull files/folders from device to local filesystem.
   * Uses the appropriate mechanism (walkDir for ios-device, pull for remotexpc).
   *
   * @param remotePath - Remote path on the device (file or directory)
   * @param localPath - Local destination path
   * @param options - Pull options (recursive, overwrite, callback)
   */
  async pull(
    remotePath: string,
    localPath: string,
    options: AfcPullOptions = {}
  ): Promise<void> {
    if (this.isRemoteXPC) {
      await this.remoteXPCAfcService.pull(remotePath, localPath, options);
    } else {
      await this.pullWithWalkDir(remotePath, localPath, options);
    }
  }

  /**
   * Internal implementation of pull for ios-device using walkDir.
   * Walks the remote directory tree and pulls files to local filesystem.
   */
  private async pullWithWalkDir(
    remotePath: string,
    localPath: string,
    options: AfcPullOptions
  ): Promise<void> {
    const {recursive = false, overwrite = true, callback} = options;

    const isDir = await this.isDirectory(remotePath);

    if (!isDir) {
      // Single file pull
      const localFilePath = (await this.isLocalDirectory(localPath))
        ? path.join(localPath, path.posix.basename(remotePath))
        : localPath;

      if (!overwrite && await this.localPathExists(localFilePath)) {
        throw new Error(`Local file already exists: ${localFilePath}`);
      }

      await this.pullSingleFile(remotePath, localFilePath);

      if (callback) {
        await callback(remotePath, localFilePath, false);
      }
      return;
    }

    // Directory pull requires recursive option
    if (!recursive) {
      throw new Error(
        `Cannot pull directory '${remotePath}' without recursive option. Set recursive: true to pull directories.`
      );
    }

    // Determine local root directory
    const localDstIsDirectory = await this.isLocalDirectory(localPath);
    const localRootDir = localDstIsDirectory
      ? path.join(localPath, path.posix.basename(remotePath))
      : localPath;

    // Create the root directory
    await mkdirp(localRootDir);

    if (callback) {
      await callback(remotePath, localRootDir, true);
    }

    // Walk the remote directory and pull files
    await this.iosDeviceAfcService.walkDir(remotePath, true, async (entryPath: string, isDirectory: boolean) => {
      // Calculate relative path from remote root
      const relativePath = entryPath.startsWith(remotePath + '/')
        ? entryPath.slice(remotePath.length + 1)
        : entryPath.slice(remotePath.length);
      const localEntryPath = path.join(localRootDir, relativePath);

      if (isDirectory) {
        await mkdirp(localEntryPath);
        if (callback) {
          await callback(entryPath, localEntryPath, true);
        }
      } else {
        // Ensure parent directory exists
        const parentDir = path.dirname(localEntryPath);
        await mkdirp(parentDir);

        if (!overwrite && await this.localPathExists(localEntryPath)) {
          throw new Error(`Local file already exists: ${localEntryPath}`);
        }

        await this.pullSingleFile(entryPath, localEntryPath);

        if (callback) {
          await callback(entryPath, localEntryPath, false);
        }
      }
    });
  }

  /**
   * Pull a single file from device to local filesystem using streams.
   */
  private async pullSingleFile(remotePath: string, localPath: string): Promise<void> {
    const readStream = await this.iosDeviceAfcService.createReadStream(remotePath, {
      autoDestroy: true,
    });
    const writeStream = fs.createWriteStream(localPath, {autoClose: true});

    await pipeline(readStream, writeStream);
  }

  /**
   * Check if a local path exists and is a directory.
   */
  private async isLocalDirectory(localPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(localPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if a local path exists.
   */
  private async localPathExists(localPath: string): Promise<boolean> {
    try {
      await fs.access(localPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close the AFC service connection and remoteXPC connection if present
   */
  async close(): Promise<void> {
    this.service.close();
    if (this.remoteXPCConnection) {
      try {
        await this.remoteXPCConnection.close();
      } catch {}
    }
  }
}
