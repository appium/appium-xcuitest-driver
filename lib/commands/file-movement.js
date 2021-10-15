import _ from 'lodash';
import { fs, tempDir, mkdirp, zip, util } from 'appium-support';
import path from 'path';
import log from '../logger';
import { services } from 'appium-ios-device';
import { pullFile, pullFolder, pushFile } from '../ios-fs-helpers';

const CONTAINER_PATH_MARKER = '@';
// https://regex101.com/r/PLdB0G/2
const CONTAINER_PATH_PATTERN = new RegExp(`^${CONTAINER_PATH_MARKER}([^/]+)/(.*)`);
const CONTAINER_TYPE_SEPARATOR = ':';
const CONTAINER_DOCUMENTS_PATH = 'Documents';
const OBJECT_NOT_FOUND_ERROR_MESSAGE = 'OBJECT_NOT_FOUND';

const commands = {};

function verifyIsSubPath (originalPath, root) {
  const normalizedRoot = path.normalize(root);
  const normalizedPath = path.normalize(path.dirname(originalPath));
  // If originalPath is root, `/`, originalPath should equal to normalizedRoot
  if (normalizedRoot !== originalPath && !normalizedPath.startsWith(normalizedRoot)) {
    log.errorAndThrow(`'${normalizedPath}' is expected to be a subpath of '${normalizedRoot}'`);
  }
}

async function createAfcClient (udid, bundleId, containerType) {
  if (!bundleId) {
    return await services.startAfcService(udid);
  }
  const service = await services.startHouseArrestService(udid);
  return isDocumentsContainer(containerType)
    ? await service.vendDocuments(bundleId)
    : await service.vendContainer(bundleId);
}

function isDocumentsContainer (containerType) {
  return _.toLower(containerType) === _.toLower(CONTAINER_DOCUMENTS_PATH);
}

async function createService (udid, remotePath) {
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer, containerType} = await parseContainerPath(remotePath);
    const service = await createAfcClient(udid, bundleId, containerType);
    const relativePath = isDocumentsContainer(containerType)
      ? path.join(CONTAINER_DOCUMENTS_PATH, pathInContainer)
      : pathInContainer;
    return {service, relativePath};
  } else {
    const service = await createAfcClient(udid);
    return {service, relativePath: remotePath};
  }
}

/**
 * @typedef {Object} ContainerObject
 *
 * @property {string} bundleId - The parsed bundle identifier
 * @property {string} pathInContainer - The absolute full path of the item on the local file system
 * @property {?string} containerType - The container type
 */

/**
 * Parses the actual path and the bundle identifier from the given path string
 *
 * @param {string} remotePath - The given path string. The string should
 * match `CONTAINER_PATH_PATTERN` regexp, otherwise an error is going
 * to be thrown. A valid string example: `@bundle.identifier:container_type/relative_path_in_container`
 * @param {Function|string} containerRootSupplier - Either a string, that contains
 * full path to the mount root for real devices or a function, which accepts two parameters
 * (bundle identifier and optional container type) and returns full path to container
 * root folder on the local file system, for Simulator
 * @returns {ContainerObject}
 */
async function parseContainerPath (remotePath, containerRootSupplier) {
  const match = CONTAINER_PATH_PATTERN.exec(remotePath);
  if (!match) {
    log.errorAndThrow(`It is expected that package identifier ` +
      `starts with '${CONTAINER_PATH_MARKER}' and is separated from the ` +
      `relative path with a single slash. '${remotePath}' is given instead`);
  }
  let [, bundleId, relativePath] = match;
  let containerType = null;
  const typeSeparatorPos = bundleId.indexOf(CONTAINER_TYPE_SEPARATOR);
  // We only consider container type exists if its length is greater than zero
  // not counting the colon
  if (typeSeparatorPos > 0 && typeSeparatorPos < bundleId.length - 1) {
    containerType = bundleId.substring(typeSeparatorPos + 1);
    log.debug(`Parsed container type: ${containerType}`);
    bundleId = bundleId.substring(0, typeSeparatorPos);
  }
  if (_.isNil(containerRootSupplier)) {
    const pathInContainer = relativePath;
    return { bundleId, pathInContainer, containerType };
  }
  const containerRoot = _.isFunction(containerRootSupplier)
    ? await containerRootSupplier(bundleId, containerType)
    : containerRootSupplier;
  const pathInContainer = path.posix.resolve(containerRoot, relativePath);
  verifyIsSubPath(pathInContainer, containerRoot);
  return {bundleId, pathInContainer, containerType};
}

/**
 * Save the given base64 data chunk as a binary file on the Simulator under test.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The remote path on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be uploaded to the corresponding
 *                              application container instead of the default media folder, for example
 *                              '@com.myapp.bla:data/RelativePathInContainer/111.png'. The '@' character at the
 *                              beginning of the argument is mandatory in such case. The colon at the end of bundle identifier
 *                              is optional and is used to distinguish the container type.
 *                              Possible values there are 'app', 'data', 'groups', '<A specific App Group container>'.
 *                              The default value is 'app'.
 *                              The relative folder path is ignored if the file is going to be uploaded
 *                              to the default media folder and only the file name is considered important.
 * @param {string} base64Data - Base-64 encoded content of the file to be uploaded.
 */
async function pushFileToSimulator (device, remotePath, base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer: dstPath} = await parseContainerPath(remotePath,
      async (appBundle, containerType) => await device.simctl.getAppContainer(appBundle, containerType));
    log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
      `Will put the data into '${dstPath}'`);
    if (!await fs.exists(path.dirname(dstPath))) {
      log.debug(`The destination folder '${path.dirname(dstPath)}' does not exist. Creating...`);
      await mkdirp(path.dirname(dstPath));
    }
    await fs.writeFile(dstPath, buffer);
    return;
  }
  const dstFolder = await tempDir.openDir();
  const dstPath = path.resolve(dstFolder, path.basename(remotePath));
  try {
    await fs.writeFile(dstPath, buffer);
    await device.simctl.addMedia(dstPath);
  } finally {
    await fs.rimraf(dstFolder);
  }
}

/**
 * Save the given base64 data chunk as a binary file on the device under test.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The remote path on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be uploaded to the corresponding
 *                              application container instead of the default media folder. Use
 *                              @<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>
 *                              format to pull a file or a folder from an application container of the given type.
 *                              The only supported container type is 'documents'. If the container type is not set
 *                              explicitly for a bundle id, then the default application container is going to be mounted
 *                              (aka --container ifuse argument)
 *                              e.g. If `@com.myapp.bla:documents/111.png` is provided,
 *                                   `On My iPhone/<app name>` in Files app will be mounted in the host machine.
 *                                   Base64 encoded `111.png` will be pushed into `On My iPhone/<app name>/111.png`
 *                                   as base64 decoded data.
 * @param {string} base64Data - Base-64 encoded content of the file to be uploaded.
 */
async function pushFileToRealDevice (device, remotePath, base64Data) {
  const {service, relativePath} = await createService(device.udid, remotePath);
  try {
    await pushFile(service, relativePath, base64Data);
  } catch (e) {
    log.debug(e.stack);
    throw new Error(`Could not push the file to '${remotePath}'.  Original error: ${e.message}`);
  } finally {
    service.close();
  }
}

async function deleteFileOrFolder (device, remotePath, isSimulator) {
  return isSimulator
    ? await deleteFromSimulator(device, remotePath)
    : await deleteFromRealDevice(device, remotePath);
}

/**
 * Get the content of given file or folder from iOS Simulator and return it as base-64 encoded string.
 * Folder content is recursively packed into a zip archive.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The path to a file or a folder, which exists in the corresponding application
 *                              container on Simulator. Use
 *                              @<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>
 *                              format to pull a file or a folder from an application container of the given type.
 *                              Possible container types are 'app', 'data', 'groups', '<A specific App Group container>'.
 *                              The default type is 'app'.
 * @param {boolean} isFile - Whether the destination item is a file or a folder
 * @returns {string} Base-64 encoded content of the file.
 */
async function pullFromSimulator (device, remotePath, isFile) {
  let pathOnServer;
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer: dstPath} = await parseContainerPath(remotePath,
      async (appBundle, containerType) => await device.simctl.getAppContainer(appBundle, containerType));
    log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
      `Will get the data from '${dstPath}'`);
    pathOnServer = dstPath;
  } else {
    const simRoot = device.getDir();
    pathOnServer = path.posix.join(simRoot, remotePath);
    verifyIsSubPath(pathOnServer, simRoot);
    log.info(`Got the full item path: ${pathOnServer}`);
  }
  if (!await fs.exists(pathOnServer)) {
    log.errorAndThrow(`The remote ${isFile ? 'file' : 'folder'} at '${pathOnServer}' does not exist`);
  }
  const buffer = isFile
    ? await util.toInMemoryBase64(pathOnServer)
    : await zip.toInMemoryZip(pathOnServer, {encodeToBase64: true});
  return buffer.toString();
}

/**
 * Get the content of given file or folder from the real device under test and return it as base-64 encoded string.
 * Folder content is recursively packed into a zip archive.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The path to an existing remote file on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be downloaded from the corresponding
 *                              application container instead of the default media folder. Use
 *                              @<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>
 *                              format to pull a file or a folder from an application container of the given type.
 *                              The only supported container type is 'documents'. If the container type is not set
 *                              explicitly for a bundle id, then the default application container is going to be mounted
 *                              (aka --container ifuse argument)
 *                              e.g. If `@com.myapp.bla:documents/111.png` is provided,
 *                                   `On My iPhone/<app name>` in Files app will be mounted in the host machine.
 *                                   `On My iPhone/<app name>/111.png` wil be pulled into the mounted host machine
 *                                   and Appium returns the data as base64-encoded string to client.
 *                                   `@com.myapp.bla:documents/` means `On My iPhone/<app name>`.
 * @param {boolean} isFile - Whether the destination item is a file or a folder
 * @return {string} Base-64 encoded content of the remote file
 */
async function pullFromRealDevice (device, remotePath, isFile) {
  const {service, relativePath} = await createService(device.udid, remotePath);
  try {
    const fileInfo = await service.getFileInfo(relativePath);
    if (isFile && fileInfo.isDirectory()) {
      throw new Error(`The requested path is not a file. Path: '${remotePath}'`);
    }
    if (!isFile && !fileInfo.isDirectory()) {
      throw new Error(`The requested path is not a folder. Path: '${remotePath}'`);
    }

    return fileInfo.isFile()
      ? (await pullFile(service, relativePath)).toString('base64')
      : (await pullFolder(service, relativePath)).toString();
  } finally {
    service.close();
  }
}

/**
 * Remove the file or folder from the device
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The path to a file or a folder, which exists in the corresponding application
 *                              container on Simulator. Use
 *                              @<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>
 *                              format to pull a file or a folder from an application container of the given type.
 *                              Possible container types are 'app', 'data', 'groups', '<A specific App Group container>'.
 *                              The default type is 'app'.
 */
async function deleteFromSimulator (device, remotePath) {
  let pathOnServer;
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer: dstPath} = await parseContainerPath(remotePath,
      async (appBundle, containerType) => await device.simctl.getAppContainer(appBundle, containerType));
    log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
      `'${dstPath}' will be deleted`);
    pathOnServer = dstPath;
  } else {
    const simRoot = device.getDir();
    pathOnServer = path.posix.join(simRoot, remotePath);
    verifyIsSubPath(pathOnServer, simRoot);
    log.info(`Got the full path: ${pathOnServer}`);
  }
  if (!await fs.exists(pathOnServer)) {
    log.errorAndThrow(`The remote path at '${pathOnServer}' does not exist`);
  }
  await fs.rimraf(pathOnServer);
}

/**
 * Remove the file or folder from the device
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The path to an existing remote file on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be downloaded from the corresponding
 *                              application container instead of the default media folder. Use
 *                              @<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>
 *                              format to pull a file or a folder from an application container of the given type.
 *                              The only supported container type is 'documents'. If the container type is not set
 *                              explicitly for a bundle id, then the default application container is going to be mounted
 *                              (aka --container ifuse argument)
 *                              e.g. If `@com.myapp.bla:documents/111.png` is provided,
 *                                   `On My iPhone/<app name>` in Files app will be mounted in the host machine.
 *                                   `On My iPhone/<app name>/111.png` wil be pulled into the mounted host machine
 *                                   and Appium returns the data as base64-encoded string to client.
 *                                   `@com.myapp.bla:documents/` means `On My iPhone/<app name>`.
 */
async function deleteFromRealDevice (device, remotePath) {
  const { service, relativePath } = await createService(device.udid, remotePath);
  try {
    await service.deleteDirectory(relativePath);
  } catch (e) {
    if (e.message.includes(OBJECT_NOT_FOUND_ERROR_MESSAGE)) {
      throw new Error(`Path '${remotePath}' does not exist on the device`);
    }
    throw e;
  } finally {
    service.close();
  }
}

commands.pushFile = async function pushFile (remotePath, base64Data) {
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
                      `'${remotePath}' is given instead`);
  }
  if (_.isArray(base64Data)) {
    // some clients (ahem) java, send a byte array encoding utf8 characters
    // instead of a string, which would be infinitely better!
    base64Data = Buffer.from(base64Data).toString('utf8');
  }
  return this.isSimulator()
    ? await pushFileToSimulator(this.opts.device, remotePath, base64Data)
    : await pushFileToRealDevice(this.opts.device, remotePath, base64Data);
};

commands.pullFile = async function pullFile (remotePath) {
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
                      `'${remotePath}' is given instead`);
  }
  return this.isSimulator()
    ? await pullFromSimulator(this.opts.device, remotePath, true)
    : await pullFromRealDevice(this.opts.device, remotePath, true);
};

commands.mobileDeleteFolder = async function mobileDeleteFolder (opts = {}) {
  let {remotePath} = opts;
  if (!remotePath.endsWith('/')) {
    remotePath = `${remotePath}/`;
  }
  return await deleteFileOrFolder(this.opts.device, remotePath, this.isSimulator());
};

commands.mobileDeleteFile = async function mobileDeleteFile (opts = {}) {
  const {remotePath} = opts;
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
                      `'${remotePath}' is given instead`);
  }
  return await deleteFileOrFolder(this.opts.device, remotePath, this.isSimulator());
};

commands.pullFolder = async function pullFolder (remotePath) {
  if (!remotePath.endsWith('/')) {
    remotePath = `${remotePath}/`;
  }
  return this.isSimulator()
    ? await pullFromSimulator(this.opts.device, remotePath, false)
    : await pullFromRealDevice(this.opts.device, remotePath, false);
};

export { commands, /* for testing */ parseContainerPath };
export default commands;
