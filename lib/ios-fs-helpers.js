import _ from 'lodash';
import B from 'bluebird';
import { fs, tempDir, mkdirp, zip, util, timing } from 'appium-support';
import path from 'path';
import log from './logger';

const IO_TIMEOUT_MS = 4 * 60 * 1000;
// Mobile devices use NAND memory modules for the storage,
// and the parallelism there is not as performant as on regular SSDs
const MAX_IO_CHUNK_SIZE = 8;

/**
 * Retrieve a file from a real device
 *
 * @param {AfcService} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remotePath Relative path to the file on the device
 * @returns {Buffer} The file content as a buffer
 */
async function pullFile (afcService, remotePath) {
  const stream = await afcService.createReadStream(remotePath, { autoDestroy: true });
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
 * Retrieve a folder from a real device
 *
 * @param {AfcService} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remoteRootPath Relative path to the folder on the device
 * @returns {Buffer} The folder content as a zipped base64-encoded buffer
 */
async function pullFolder (afcService, remoteRootPath) {
  const tmpFolder = await tempDir.openDir();
  try {
    const pullPromises = [];
    await afcService.walkDir(remoteRootPath, true, async (itemPath, isDir) => {
      const pathOnServer = path.join(tmpFolder, itemPath);
      if (isDir) {
        await mkdirp(pathOnServer);
        return;
      }

      const readStream = await afcService.createReadStream(itemPath, {autoDestroy: true});
      const writeStream = fs.createWriteStream(pathOnServer, {autoClose: true});
      pullPromises.push(new B((resolve, reject) => {
        writeStream.on('close', resolve);
        const onStreamingError = (e) => {
          readStream.unpipe(writeStream);
          reject(e);
        };
        writeStream.on('error', onStreamingError);
        readStream.on('error', onStreamingError);
      }).timeout(IO_TIMEOUT_MS));
      readStream.pipe(writeStream);
      if (pullPromises.length >= MAX_IO_CHUNK_SIZE) {
        await B.any(pullPromises);
      }
      _.remove(pullPromises, (p) => p.isFulfilled());
    });
    // Wait for the rest of the chunks
    await B.all(pullPromises);
    return await zip.toInMemoryZip(tmpFolder, {
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
 * @param {AfcService} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remoteRoot The relative path to the remote folder structure
 * to be created
 */
async function remoteMkdirp (afcService, remoteRoot) {
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
 * Pushes a file to a real device
 *
 * @param {AfcService} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} remotePath Relative path to the file on the device. The remote
 * folder structure is created automatically if necessary.
 * @param {string} base64Data Base64-encoded content of the file to be written
 */
async function pushFile (afcService, remotePath, base64Data) {
  await remoteMkdirp(afcService, path.dirname(remotePath));
  const stream = await afcService.createWriteStream(remotePath, {autoDestroy: true});
  let pushError = null;
  const pushPromise = new B((resolve, reject) => {
    stream.on('error', (e) => {
      pushError = e;
    });
    stream.on('close', () => {
      if (pushError) {
        reject(pushError);
      } else {
        resolve();
      }
    });
  }).timeout(IO_TIMEOUT_MS);
  stream.write(Buffer.from(base64Data, 'base64'));
  stream.end();
  await pushPromise;
}

/**
 * @typedef {Object} PushFolderOptions
 *
 * @property {number} timeoutMs [240000] The maximum timeout to wait until a
 * single file is copied
 * @param {boolean} enableParallelPush [false] Whether to push files in parallel.
 * This usually gives better performance, but might sometimes be less stable.
 */

/**
 * Pushes a folder to a real device
 *
 * @param {AfcService} afcService Apple File Client service instance from
 * 'appium-ios-device' module
 * @param {string} srcRootPath The full path to the source folder
 * @param {string} dstRootPath The relative path to the destination folder. The folder
 * will be deleted if already exists.
 * @param {PushFolderOptions} opts
 */
async function pushFolder (afcService, srcRootPath, dstRootPath, opts = {}) {
  const {
    timeoutMs = IO_TIMEOUT_MS,
    enableParallelPush = false,
  } = opts;

  const timer = new timing.Timer().start();
  const itemsToPush = await fs.glob('**', {
    cwd: srcRootPath,
    nosort: true,
    mark: true,
  });
  log.debug(`Successfully scanned the tree structure of '${srcRootPath}'`);
  const [foldersToPush, filesToPush] = itemsToPush.reduce((acc, x) => {
    acc[_.endsWith(x, path.sep) ? 0 : 1].push(x);
    return acc;
  }, [[], []]);
  log.debug(`Got ${util.pluralize('folder', foldersToPush.length, true)} and ` +
    `${util.pluralize('file', filesToPush.length, true)} to push`);
  // create the folder structure first
  try {
    await afcService.deleteDirectory(dstRootPath);
  } catch (ign) {}
  await afcService.createDirectory(dstRootPath);
  // top-level folders must go first
  const foldersToPushByHierarchy = foldersToPush
    .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  for (const relativeFolderPath of foldersToPushByHierarchy) {
    // createDirectory does not accept folder names ending with a path separator
    const absoluteFolderPath = _.trimEnd(
      path.join(dstRootPath, relativeFolderPath), path.sep
    );
    if (absoluteFolderPath) {
      await afcService.createDirectory(absoluteFolderPath);
    }
  }
  // do not forget about the root folder
  log.debug(`Successfully created the remote folder structure ` +
    `(${util.pluralize('item', foldersToPush.length + 1, true)})`);

  const pushFile = async (relativePath) => {
    const absoluteSourcePath = path.join(srcRootPath, relativePath);
    const readStream = fs.createReadStream(absoluteSourcePath, {autoClose: true});
    const absoluteDestinationPath = path.join(dstRootPath, relativePath);
    const writeStream = await afcService.createWriteStream(absoluteDestinationPath, {
      autoDestroy: true
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
    await filePushPromise.timeout(timeoutMs);
  };

  if (enableParallelPush) {
    log.debug(`Proceeding to parallel files push (max ${MAX_IO_CHUNK_SIZE} writers)`);
    const pushPromises = [];
    for (const relativeFilePath of _.shuffle(filesToPush)) {
      pushPromises.push(B.resolve(pushFile(relativeFilePath)));
      // keep the push queue filled
      if (pushPromises.length >= MAX_IO_CHUNK_SIZE) {
        await B.any(pushPromises);
      }
      _.remove(pushPromises, (p) => p.isFulfilled());
    }
    if (!_.isEmpty(pushPromises)) {
      // handle the rest of push promises
      await B.all(pushPromises);
    }
  } else {
    log.debug(`Proceeding to serial files push`);
    for (const relativeFilePath of filesToPush) {
      await pushFile(relativeFilePath);
    }
  }

  log.debug(`Successfully pushed ${util.pluralize('folder', foldersToPush.length, true)} ` +
    `and ${util.pluralize('file', filesToPush.length, true)} ` +
    `within ${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
}


export { pullFile, pullFolder, pushFile, pushFolder };