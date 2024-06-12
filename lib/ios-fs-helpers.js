import _ from 'lodash';
import B from 'bluebird';
import {fs, tempDir, mkdirp, zip, util, timing} from 'appium/support';
import path from 'path';
import log from './logger';

export const IO_TIMEOUT_MS = 4 * 60 * 1000;
// Mobile devices use NAND memory modules for the storage,
// and the parallelism there is not as performant as on regular SSDs
const MAX_IO_CHUNK_SIZE = 8;

/**
 * Retrieve a file from a real device
 *
 * @param {any} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remotePath Relative path to the file on the device
 * @returns {Promise<Buffer>} The file content as a buffer
 */
export async function pullFile(afcService, remotePath) {
  const stream = await afcService.createReadStream(remotePath, {autoDestroy: true});
  const pullPromise = new B((resolve, reject) => {
    stream.on('close', resolve);
    stream.on('error', reject);
  }).timeout(IO_TIMEOUT_MS);
  const buffers = [];
  stream.on('data', (data) => buffers.push(data));
  await pullPromise;
  return Buffer.concat(buffers);
}

/**
 * Checks a presence of a local folder.
 *
 * @param {string} folderPath Full path to the local folder
 * @returns {Promise<boolean>} True if the folder exists and is actually a folder
 */
async function folderExists(folderPath) {
  try {
    return (await fs.stat(folderPath)).isDirectory();
  } catch (e) {
    return false;
  }
}

/**
 * Retrieve a folder from a real device
 *
 * @param {any} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remoteRootPath Relative path to the folder on the device
 * @returns {Promise<Buffer>} The folder content as a zipped base64-encoded buffer
 */
export async function pullFolder(afcService, remoteRootPath) {
  const tmpFolder = await tempDir.openDir();
  try {
    let localTopItem = null;
    let countFilesSuccess = 0;
    let countFilesFail = 0;
    let countFolders = 0;
    const pullPromises = [];
    await afcService.walkDir(remoteRootPath, true, async (remotePath, isDir) => {
      const localPath = path.join(tmpFolder, remotePath);
      const dirname = isDir ? localPath : path.dirname(localPath);
      if (!(await folderExists(dirname))) {
        await mkdirp(dirname);
      }
      if (!localTopItem || localPath.split(path.sep).length < localTopItem.split(path.sep).length) {
        localTopItem = localPath;
      }
      if (isDir) {
        ++countFolders;
        return;
      }

      const readStream = await afcService.createReadStream(remotePath, {autoDestroy: true});
      const writeStream = fs.createWriteStream(localPath, {autoClose: true});
      pullPromises.push(
        new B((resolve) => {
          writeStream.on('close', () => {
            ++countFilesSuccess;
            resolve();
          });
          const onStreamingError = (e) => {
            readStream.unpipe(writeStream);
            log.warn(
              `Cannot pull '${remotePath}' to '${localPath}'. ` +
                `The file will be skipped. Original error: ${e.message}`,
            );
            ++countFilesFail;
            resolve();
          };
          writeStream.on('error', onStreamingError);
          readStream.on('error', onStreamingError);
        }).timeout(IO_TIMEOUT_MS),
      );
      readStream.pipe(writeStream);
      if (pullPromises.length >= MAX_IO_CHUNK_SIZE) {
        await B.any(pullPromises);
      }
      _.remove(pullPromises, (p) => p.isFulfilled());
    });
    // Wait for the rest of files to be pulled
    if (!_.isEmpty(pullPromises)) {
      await B.all(pullPromises);
    }
    log.info(
      `Pulled ${util.pluralize('file', countFilesSuccess, true)} out of ` +
        `${countFilesSuccess + countFilesFail} and ${util.pluralize(
          'folder',
          countFolders,
          true,
        )} ` +
        `from '${remoteRootPath}'`,
    );
    return await zip.toInMemoryZip(localTopItem ? path.dirname(localTopItem) : tmpFolder, {
      encodeToBase64: true,
    });
  } finally {
    await fs.rimraf(tmpFolder);
  }
}

/**
 * Creates remote folder path recursively. Noop if the given path
 * already exists
 *
 * @param {any} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remoteRoot The relative path to the remote folder structure
 * to be created
 */
async function remoteMkdirp(afcService, remoteRoot) {
  if (remoteRoot === '.' || remoteRoot === '/') {
    return;
  }
  try {
    await afcService.listDirectory(remoteRoot);
    return;
  } catch (e) {
    // This means that the directory is missing and we got an object not found error.
    // Therefore, we are going to the parent
    await remoteMkdirp(afcService, path.dirname(remoteRoot));
  }
  await afcService.createDirectory(remoteRoot);
}

/**
 * @typedef {Object} PushFileOptions
 * @property {number} [timeoutMs=240000] The maximum count of milliceconds to wait until
 * file push is completed. Cannot be lower than 60000ms
 */

/**
 * Pushes a file to a real device
 *
 * @param {any} afcService afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string|Buffer} localPathOrPayload Either full path to the source file
 * or a buffer payload to be written into the remote destination
 * @param {string} remotePath Relative path to the file on the device. The remote
 * folder structure is created automatically if necessary.
 * @param {PushFileOptions} [opts={}]
 */
export async function pushFile (afcService, localPathOrPayload, remotePath, opts = {}) {
  const {
    timeoutMs = IO_TIMEOUT_MS,
  } = opts;
  const timer = new timing.Timer().start();
  await remoteMkdirp(afcService, path.dirname(remotePath));
  const source = Buffer.isBuffer(localPathOrPayload)
    ? localPathOrPayload
    : fs.createReadStream(localPathOrPayload, {autoClose: true});
  const writeStream = await afcService.createWriteStream(remotePath, {
    autoDestroy: true,
  });
  writeStream.on('finish', writeStream.destroy);
  let pushError = null;
  const filePushPromise = new B((resolve, reject) => {
    writeStream.on('close', () => {
      if (pushError) {
        reject(pushError);
      } else {
        resolve();
      }
    });
    const onStreamError = (e) => {
      if (!Buffer.isBuffer(source)) {
        source.unpipe(writeStream);
      }
      log.debug(e);
      pushError = e;
    };
    writeStream.on('error', onStreamError);
    if (!Buffer.isBuffer(source)) {
      source.on('error', onStreamError);
    }
  });
  if (Buffer.isBuffer(source)) {
    writeStream.write(source);
    writeStream.end();
  } else {
    source.pipe(writeStream);
  }
  await filePushPromise.timeout(Math.max(timeoutMs, 60000));
  const fileSize = Buffer.isBuffer(localPathOrPayload)
    ? localPathOrPayload.length
    : (await fs.stat(localPathOrPayload)).size;
  log.debug(
    `Successfully pushed the file payload (${util.toReadableSizeString(fileSize)}) ` +
    `to the remote location '${remotePath}' in ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`
  );
};

/**
 * @typedef {Object} PushFolderOptions
 *
 * @property {number} [timeoutMs=240000] The maximum timeout to wait until a
 * single file is copied
 * @property {boolean} [enableParallelPush=false] Whether to push files in parallel.
 * This usually gives better performance, but might sometimes be less stable.
 */

/**
 * Pushes a folder to a real device
 *
 * @param {any} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} srcRootPath The full path to the source folder
 * @param {string} dstRootPath The relative path to the destination folder. The folder
 * will be deleted if already exists.
 * @param {PushFolderOptions} opts
 */
export async function pushFolder(afcService, srcRootPath, dstRootPath, opts = {}) {
  const {timeoutMs = IO_TIMEOUT_MS, enableParallelPush = false} = opts;

  const timer = new timing.Timer().start();
  const allItems = /** @type {import('path-scurry').Path[]} */ (/** @type {unknown} */ (
    await fs.glob('**', {
      cwd: srcRootPath,
      withFileTypes: true,
    }))
  );
  log.debug(`Successfully scanned the tree structure of '${srcRootPath}'`);
  // top-level folders go first
  /** @type {string[]} */
  const foldersToPush = allItems
    .filter((x) => x.isDirectory())
    .map((x) => x.relative())
    .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  // larger files go first
  /** @type {string[]} */
  const filesToPush = allItems
    .filter((x) => !x.isDirectory())
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .map((x) => x.relative());
  log.debug(
    `Got ${util.pluralize('folder', foldersToPush.length, true)} and ` +
      `${util.pluralize('file', filesToPush.length, true)} to push`,
  );
  // create the folder structure first
  try {
    await afcService.deleteDirectory(dstRootPath);
  } catch (ign) {}
  await afcService.createDirectory(dstRootPath);
  for (const relativeFolderPath of foldersToPush) {
    // createDirectory does not accept folder names ending with a path separator
    const absoluteFolderPath = _.trimEnd(path.join(dstRootPath, relativeFolderPath), path.sep);
    if (absoluteFolderPath) {
      await afcService.createDirectory(absoluteFolderPath);
    }
  }
  // do not forget about the root folder
  log.debug(
    `Successfully created the remote folder structure ` +
      `(${util.pluralize('item', foldersToPush.length + 1, true)})`,
  );

  const _pushFile = async (/** @type {string} */ relativePath) => {
    const absoluteSourcePath = path.join(srcRootPath, relativePath);
    const readStream = fs.createReadStream(absoluteSourcePath, {autoClose: true});
    const absoluteDestinationPath = path.join(dstRootPath, relativePath);
    const writeStream = await afcService.createWriteStream(absoluteDestinationPath, {
      autoDestroy: true,
    });
    writeStream.on('finish', writeStream.destroy);
    let pushError = null;
    const filePushPromise = new B((resolve, reject) => {
      writeStream.on('close', () => {
        if (pushError) {
          reject(pushError);
        } else {
          resolve();
        }
      });
      const onStreamError = (e) => {
        readStream.unpipe(writeStream);
        log.debug(e);
        pushError = e;
      };
      writeStream.on('error', onStreamError);
      readStream.on('error', onStreamError);
    });
    readStream.pipe(writeStream);
    await filePushPromise.timeout(Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000));
  };

  if (enableParallelPush) {
    log.debug(`Proceeding to parallel files push (max ${MAX_IO_CHUNK_SIZE} writers)`);
    const pushPromises = [];
    for (const relativeFilePath of filesToPush) {
      pushPromises.push(B.resolve(_pushFile(relativeFilePath)));
      // keep the push queue filled
      if (pushPromises.length >= MAX_IO_CHUNK_SIZE) {
        await B.any(pushPromises);
        const elapsedMs = timer.getDuration().asMilliSeconds;
        if (elapsedMs > timeoutMs) {
          throw new B.TimeoutError(`Timed out after ${elapsedMs} ms`);
        }
      }
      _.remove(pushPromises, (p) => p.isFulfilled());
    }
    if (!_.isEmpty(pushPromises)) {
      // handle the rest of push promises
      await B.all(pushPromises).timeout(Math.max(timeoutMs - timer.getDuration().asMilliSeconds, 60000));
    }
  } else {
    log.debug(`Proceeding to serial files push`);
    for (const relativeFilePath of filesToPush) {
      await _pushFile(relativeFilePath);
      const elapsedMs = timer.getDuration().asMilliSeconds;
      if (elapsedMs > timeoutMs) {
        throw new B.TimeoutError(`Timed out after ${elapsedMs} ms`);
      }
    }
  }

  log.debug(
    `Successfully pushed ${util.pluralize('folder', foldersToPush.length, true)} ` +
      `and ${util.pluralize('file', filesToPush.length, true)} ` +
      `within ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
  );
}
