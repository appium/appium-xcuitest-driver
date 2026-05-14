import type {Readable} from 'node:stream';
import {Readable as ReadableStream} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fs, util} from 'appium/support';
import {services} from 'appium-ios-device';
import type {AfcService as IOSDeviceAfcService} from 'appium-ios-device';
import {getRemoteXPCServices} from './remotexpc-utils';
import {log} from '../logger';
import type {AfcService as RemoteXPCAfcService, RemoteXpcConnection} from 'appium-ios-remotexpc';
import {IO_TIMEOUT_MS, MAX_IO_CHUNK_SIZE} from './real-device-management';
import {withTimeout} from '../utils';

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

/** Context for bounded concurrent pull during ios-device walkDir. */
interface WalkDirPullWalkContext {
  remoteTreeRoot: string;
  localRootDir: string;
  overwrite: boolean;
  onEntry?: AfcPullOptions['onEntry'];
  /** In-flight pulls only; entries removed when a slot frees. */
  activePulls: Promise<void>[];
  pullRejections: unknown[];
  waitForPullSlot: () => Promise<void>;
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
  private readonly _isRemoteXPC: boolean;

  private constructor(
    service: RemoteXPCAfcService | IOSDeviceAfcService,
    isRemoteXPC: boolean = false,
  ) {
    this.service = service;
    this._isRemoteXPC = isRemoteXPC;
  }

  /**
   * Check if this client is using RemoteXPC
   */
  private get isRemoteXPC(): boolean {
    return this._isRemoteXPC;
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
      // Best-practice pattern (matches go-ios `defer rsd.Close()` and
      // pymobiledevice3 single-RSD-per-session): perform exactly one RSD
      // probe via `startAfcService`, which discovers the AFC port, closes
      // its discovery RSD eagerly, and returns a self-contained AfcService
      // bound to its own per-service TCP socket. Opening an extra RSD here
      // would only race with the one inside `startAfcService` and trigger
      // an ECONNRESET from the on-device `remoted` daemon.
      try {
        const Services = await getRemoteXPCServices();
        const afcService = await Services.startAfcService(udid);
        return new AfcClient(afcService, true);
      } catch (err: any) {
        log.error(
          `Failed to create AFC client via RemoteXPC: ${err.message}, falling back to appium-ios-device`,
        );
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
      // Best-practice pattern (matches go-ios `defer rsd.Close()`): one RSD
      // probe via `startHouseArrestService`, vend the AFC service, then
      // release the discovery RSD eagerly. The vended AfcService has its
      // own dedicated socket so it does not need the discovery RSD to
      // remain open. Avoids the prior pattern of overlapping RSD probes
      // that triggered ECONNRESETs from the on-device `remoted` daemon.
      let houseArrestRemoteXPC: RemoteXpcConnection | undefined;
      try {
        const Services = await getRemoteXPCServices();
        const result = await Services.startHouseArrestService(udid);
        houseArrestRemoteXPC = result.remoteXPC;
        const afcService = isDocuments
          ? await result.houseArrestService.vendDocuments(bundleId)
          : await result.houseArrestService.vendContainer(bundleId);
        return new AfcClient(afcService, true);
      } catch (err: any) {
        log.error(
          `Failed to create AFC client via RemoteXPC: ${err.message}, falling back to appium-ios-device`,
        );
      } finally {
        if (houseArrestRemoteXPC) {
          try {
            await houseArrestRemoteXPC.close();
          } catch {
            // ignore cleanup errors
          }
        }
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
   * Close the AFC service connection
   */
  async close(): Promise<void> {
    this.service.close();
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

    if (!(await this.isDirectory(remotePath))) {
      await this.pullWalkDirSingleFile(remotePath, localPath, overwrite, onEntry);
      return;
    }

    if (!recursive) {
      throw new Error(
        `Cannot pull directory '${remotePath}' without recursive option. Set recursive: true to pull directories.`,
      );
    }

    const localRootDir = await this.prepareWalkPullDirectoryRoot(remotePath, localPath, onEntry);
    const activePulls: Promise<void>[] = [];
    const pullRejections: unknown[] = [];
    const waitForPullSlot = this.createBoundedPullSlotWaiter(activePulls);
    const ctx: WalkDirPullWalkContext = {
      remoteTreeRoot: remotePath,
      localRootDir,
      overwrite,
      onEntry,
      activePulls,
      pullRejections,
      waitForPullSlot,
    };

    await this.iosDeviceAfcService.walkDir(
      remotePath,
      true,
      async (entryPath, isDirectory) =>
        await this.processWalkDirPullEntry(ctx, entryPath, isDirectory),
    );

    // Rejects still in `activePulls` surface via `Promise.all`. Pulls already spliced out after a
    // failure are not in that array; their reasons were pushed once in `pull.catch` and surface here.
    if (activePulls.length > 0) {
      await Promise.all(activePulls);
    }
    if (pullRejections.length > 0) {
      const [first, ...rest] = pullRejections;
      throw rest.length === 0
        ? first
        : new AggregateError(
            pullRejections,
            `${util.pluralize('pull', pullRejections.length, true)} failed`,
          );
    }
  }

  /** Pull a single remote file when walkDir target is not a directory. */
  private async pullWalkDirSingleFile(
    remotePath: string,
    localPath: string,
    overwrite: boolean,
    onEntry?: AfcPullOptions['onEntry'],
  ): Promise<void> {
    const localFilePath = (await this.isLocalDirectory(localPath))
      ? path.join(localPath, path.posix.basename(remotePath))
      : localPath;

    await this.checkOverwrite(localFilePath, overwrite);
    await this.pullSingleFile(remotePath, localFilePath);

    if (onEntry) {
      await onEntry(remotePath, localFilePath, false);
    }
  }

  /** Creates local root folder and notifies onEntry for the directory root. */
  private async prepareWalkPullDirectoryRoot(
    remotePath: string,
    localPath: string,
    onEntry?: AfcPullOptions['onEntry'],
  ): Promise<string> {
    const localDstIsDirectory = await this.isLocalDirectory(localPath);
    const localRootDir = localDstIsDirectory
      ? path.join(localPath, path.posix.basename(remotePath))
      : localPath;

    await fs.mkdirp(localRootDir);

    if (onEntry) {
      await onEntry(remotePath, localRootDir, true);
    }
    return localRootDir;
  }

  /**
   * Returns a waiter that blocks until fewer than MAX_IO_CHUNK_SIZE pulls are in flight.
   * Uses Promise.race over in-flight pull completions to free a slot.
   */
  private createBoundedPullSlotWaiter(activePulls: Promise<void>[]): () => Promise<void> {
    return async (): Promise<void> => {
      while (activePulls.length >= MAX_IO_CHUNK_SIZE) {
        const indexed: Promise<number>[] = [];
        for (let i = 0; i < activePulls.length; i++) {
          indexed.push(racePullCompletionIndex(activePulls[i], i));
        }
        const doneIndex = await Promise.race(indexed);
        // The raced pull has already settled; removing it from the pool is bookkeeping only.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- false positive: splice drops a completed task reference
        activePulls.splice(doneIndex, 1);
      }
    };
  }

  private async processWalkDirPullEntry(
    ctx: WalkDirPullWalkContext,
    entryPath: string,
    isDirectory: boolean,
  ): Promise<void> {
    const {
      remoteTreeRoot,
      localRootDir,
      overwrite,
      onEntry,
      activePulls,
      pullRejections,
      waitForPullSlot,
    } = ctx;
    const relativePath = entryPath.startsWith(remoteTreeRoot + '/')
      ? entryPath.slice(remoteTreeRoot.length + 1)
      : entryPath.slice(remoteTreeRoot.length);
    const localEntryPath = path.join(localRootDir, relativePath);

    if (isDirectory) {
      await fs.mkdirp(localEntryPath);
      if (onEntry) {
        await onEntry(entryPath, localEntryPath, true);
      }
      return;
    }

    await this.checkOverwrite(localEntryPath, overwrite);
    await fs.mkdirp(path.dirname(localEntryPath));
    await waitForPullSlot();
    const pull = this.pullRemoteFileToLocalViaStreams(entryPath, localEntryPath, onEntry);
    activePulls.push(pull);
    // eslint-disable-next-line promise/prefer-await-to-then
    void pull.catch((reason: unknown) => {
      pullRejections.push(reason);
    });
  }

  /**
   * Pull one remote file to a local path using streams (ios-device AFC only).
   * Resolves when the write stream closes or when streaming is skipped after an error.
   */
  private async pullRemoteFileToLocalViaStreams(
    entryPath: string,
    localEntryPath: string,
    onEntry: AfcPullOptions['onEntry'],
  ): Promise<void> {
    const readStream = await this.iosDeviceAfcService.createReadStream(entryPath, {
      autoDestroy: true,
    });
    const writeStream = fs.createWriteStream(localEntryPath, {autoClose: true});
    await withTimeout(
      new Promise<void>((resolve) => {
        writeStream.on('close', async () => {
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
        readStream.pipe(writeStream);
      }),
      IO_TIMEOUT_MS,
    );
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
}

/**
 * Resolves with slot index `i` when pull `p` settles. Each pull records at most one rejection via a
 * per-pull `.catch` when enqueued; this helper only swallows errors so the slot waiter can splice
 * `activePulls` without throwing.
 */
async function racePullCompletionIndex(p: Promise<void>, i: number): Promise<number> {
  try {
    await p;
  } catch {
    // Failed pull still frees a concurrency slot; rejection is already handled on `p`.
  }
  return i;
}
