import type {Readable} from 'node:stream';
import {Readable as ReadableStream} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import _ from 'lodash';
import B from 'bluebird';
import {fs, mkdirp} from 'appium/support';
import {services} from 'appium-ios-device';
import type {AfcService as IOSDeviceAfcService} from 'appium-ios-device';
import {getRemoteXPCServices} from './remotexpc-utils';
import {log} from '../logger';
import type {AfcService as RemoteXPCAfcService, RemoteXpcConnection} from 'appium-ios-remotexpc';
import {IO_TIMEOUT_MS, MAX_IO_CHUNK_SIZE} from './real-device-management';

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
 * Unified AFC Client
 *
 * Provides a unified interface for file operations on iOS devices,
 * automatically handling the differences between iOS < 18 (appium-ios-device)
 * and iOS 18 and above (appium-ios-remotexpc).
 */
export class AfcClient {
  private readonly service: RemoteXPCAfcService | IOSDeviceAfcService;
  private readonly remoteXPCConnection?: RemoteXpcConnection;

  private constructor(
    service: RemoteXPCAfcService | IOSDeviceAfcService,
    remoteXPCConnection?: RemoteXpcConnection,
  ) {
    this.service = service;
    this.remoteXPCConnection = remoteXPCConnection;
  }

  //#region Public Methods

  /**
   * Create an AFC client for device
   *
   * @param udid - Device UDID
   * @param useRemoteXPC - Whether to use remotexpc (use isIos18OrNewer(opts) to determine)
   * @returns AFC client instance
   */
  static async createForDevice(udid: string, useRemoteXPC: boolean): Promise<AfcClient> {
    if (useRemoteXPC) {
      const client = await AfcClient.withRemoteXpcConnection(async () => {
        const Services = await getRemoteXPCServices();
        const connectionResult = await Services.createRemoteXPCConnection(udid);
        const afcService = await Services.startAfcService(udid);
        return {
          service: afcService,
          connection: connectionResult.remoteXPC,
        };
      });
      if (client) {
        return client;
      }
    }

    const afcService = await services.startAfcService(udid);
    return new AfcClient(afcService);
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
    options?: CreateForAppOptions,
  ): Promise<AfcClient> {
    const {containerType = null, skipDocumentsCheck = false} = options ?? {};
    const isDocuments = !skipDocumentsCheck && containerType?.toLowerCase() === 'documents';

    if (useRemoteXPC) {
      const client = await AfcClient.withRemoteXpcConnection(async () => {
        const Services = await getRemoteXPCServices();
        const connectionResult = await Services.createRemoteXPCConnection(udid);
        const {houseArrestService, remoteXPC: houseArrestRemoteXPC} =
          await Services.startHouseArrestService(udid);
        const afcService = isDocuments
          ? await houseArrestService.vendDocuments(bundleId)
          : await houseArrestService.vendContainer(bundleId);
        // Use the remoteXPC from house arrest service if available, otherwise use the one from connection
        const connection = houseArrestRemoteXPC ?? connectionResult.remoteXPC;
        return {
          service: afcService,
          connection,
        };
      });
      if (client) {
        return client;
      }
    }

    const houseArrestService = await services.startHouseArrestService(udid);
    const afcService = isDocuments
      ? await houseArrestService.vendDocuments(bundleId)
      : await houseArrestService.vendContainer(bundleId);
    return new AfcClient(afcService);
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
      return;
    }
    // For ios-device, convert buffer to stream and use writeFromStream
    const bufferStream = ReadableStream.from([data]);
    return await this.writeFromStream(path, bufferStream);
  }

  /**
   * Write file contents from a readable stream
   */
  async writeFromStream(path: string, stream: Readable): Promise<void> {
    if (this.isRemoteXPC) {
      await this.remoteXPCAfcService.writeFromStream(path, stream);
      return;
    }

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

  /**
   * Pull files/folders from device to local filesystem.
   * Uses the appropriate mechanism (walkDir for ios-device, pull for remotexpc).
   *
   * @param remotePath - Remote path on the device (file or directory)
   * @param localPath - Local destination path
   * @param options - Pull options (recursive, overwrite, onEntry)
   */
  async pull(remotePath: string, localPath: string, options: AfcPullOptions = {}): Promise<void> {
    if (this.isRemoteXPC) {
      // RemoteXPC expects 'callback' property, so map onEntry -> callback
      const remoteXpcOptions = {
        ...options,
        callback: options.onEntry,
      };
      delete remoteXpcOptions.onEntry;
      await this.remoteXPCAfcService.pull(remotePath, localPath, remoteXpcOptions);
    } else {
      await this.pullWithWalkDir(remotePath, localPath, options);
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

  //#endregion

  //#region Private Methods

  /**
   * Check if this client is using RemoteXPC
   */
  private get isRemoteXPC(): boolean {
    return !!this.remoteXPCConnection;
  }

  /**
   * Helper to safely execute remoteXPC operations with connection cleanup
   * @param operation - Async operation that returns an AfcClient
   * @returns AfcClient on success, null on failure
   */
  private static async withRemoteXpcConnection<T extends RemoteXPCAfcService | IOSDeviceAfcService>(
    operation: () => Promise<{service: T; connection: RemoteXpcConnection}>,
  ): Promise<AfcClient | null> {
    let remoteXPCConnection: RemoteXpcConnection | undefined;
    let succeeded = false;
    try {
      const {service, connection} = await operation();
      remoteXPCConnection = connection;
      const client = new AfcClient(service, remoteXPCConnection);
      succeeded = true;
      return client;
    } catch (err: any) {
      log.error(
        `Failed to create AFC client via RemoteXPC: ${err.message}, falling back to appium-ios-device`,
      );
      return null;
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
   * Create a read stream for a file (internal use only).
   */
  private async createReadStream(
    remotePath: string,
    options?: {autoDestroy?: boolean},
  ): Promise<Readable> {
    if (this.isRemoteXPC) {
      // Use readToStream which returns a streaming Readable
      return await this.remoteXPCAfcService.readToStream(remotePath);
    }
    return await this.iosDeviceAfcService.createReadStream(remotePath, options);
  }

  /**
   * Internal implementation of pull for ios-device using walkDir.
   * Walks the remote directory tree and pulls files to local filesystem.
   */
  private async pullWithWalkDir(
    remotePath: string,
    localPath: string,
    options: AfcPullOptions,
  ): Promise<void> {
    const {recursive = false, overwrite = true, onEntry} = options;

    const isDir = await this.isDirectory(remotePath);

    if (!isDir) {
      // Single file pull
      const localFilePath = (await this.isLocalDirectory(localPath))
        ? path.join(localPath, path.posix.basename(remotePath))
        : localPath;

      await this.checkOverwrite(localFilePath, overwrite);
      await this.pullSingleFile(remotePath, localFilePath);

      if (onEntry) {
        await onEntry(remotePath, localFilePath, false);
      }
      return;
    }

    // Directory pull requires recursive option
    if (!recursive) {
      throw new Error(
        `Cannot pull directory '${remotePath}' without recursive option. Set recursive: true to pull directories.`,
      );
    }

    // Determine local root directory
    const localDstIsDirectory = await this.isLocalDirectory(localPath);
    const localRootDir = localDstIsDirectory
      ? path.join(localPath, path.posix.basename(remotePath))
      : localPath;

    // Create the root directory
    await mkdirp(localRootDir);

    if (onEntry) {
      await onEntry(remotePath, localRootDir, true);
    }

    const pullPromises: B<void>[] = [];

    // Walk the remote directory and pull files in parallel
    await this.iosDeviceAfcService.walkDir(
      remotePath,
      true,
      async (entryPath: string, isDirectory: boolean) => {
        // Calculate relative path from remote root
        const relativePath = entryPath.startsWith(remotePath + '/')
          ? entryPath.slice(remotePath.length + 1)
          : entryPath.slice(remotePath.length);
        const localEntryPath = path.join(localRootDir, relativePath);

        if (isDirectory) {
          await mkdirp(localEntryPath);
          if (onEntry) {
            await onEntry(entryPath, localEntryPath, true);
          }
        } else {
          await this.checkOverwrite(localEntryPath, overwrite);

          // Ensure parent directory exists
          const parentDir = path.dirname(localEntryPath);
          await mkdirp(parentDir);

          // Start async file pull (non-blocking)
          const readStream = await this.iosDeviceAfcService.createReadStream(entryPath, {
            autoDestroy: true,
          });
          const writeStream = fs.createWriteStream(localEntryPath, {autoClose: true});

          pullPromises.push(
            new B<void>((resolve) => {
              writeStream.on('close', async () => {
                // Invoke onEntry callback after successful pull
                if (onEntry) {
                  try {
                    await onEntry(entryPath, localEntryPath, false);
                  } catch (err: any) {
                    log.warn(`onEntry callback failed for '${entryPath}': ${err.message}`);
                  }
                }
                resolve();
              });
              const onStreamingError = (e: Error) => {
                readStream.unpipe(writeStream);
                log.warn(
                  `Cannot pull '${entryPath}' to '${localEntryPath}'. ` +
                    `The file will be skipped. Original error: ${e.message}`,
                );
                resolve();
              };
              writeStream.on('error', onStreamingError);
              readStream.on('error', onStreamingError);
            }).timeout(IO_TIMEOUT_MS),
          );
          readStream.pipe(writeStream);

          if (pullPromises.length >= MAX_IO_CHUNK_SIZE) {
            await B.any(pullPromises);
            for (let i = pullPromises.length - 1; i >= 0; i--) {
              if (pullPromises[i].isFulfilled()) {
                pullPromises.splice(i, 1);
              }
            }
          }
        }
      },
    );

    // Wait for remaining files to be pulled
    if (!_.isEmpty(pullPromises)) {
      await B.all(pullPromises);
    }
  }

  /**
   * Check if local file exists and should not be overwritten.
   * Throws an error if the file exists and overwrite is false.
   *
   * @param localPath - Local file path to check
   * @param overwrite - Whether to allow overwriting existing files
   */
  private async checkOverwrite(localPath: string, overwrite: boolean): Promise<void> {
    if (!overwrite && (await fs.exists(localPath))) {
      throw new Error(`Local file already exists: ${localPath}`);
    }
  }

  /**
   * Pull a single file from device to local filesystem using streams.
   * This method only works for ios-device.
   *
   * @param remotePath - Remote file path
   * @param localPath - Local destination path
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

  //#endregion
}
