import _ from 'lodash';
import {fs, tempDir, mkdirp, zip, util} from 'appium/support';
import path from 'path';
import {services} from 'appium-ios-device';
import {pullFile, pullFolder, pushFile} from '../ios-fs-helpers';
import {errors} from 'appium/driver';

const CONTAINER_PATH_MARKER = '@';
// https://regex101.com/r/PLdB0G/2
const CONTAINER_PATH_PATTERN = new RegExp(`^${CONTAINER_PATH_MARKER}([^/]+)/(.*)`);
const CONTAINER_TYPE_SEPARATOR = ':';
const CONTAINER_DOCUMENTS_PATH = 'Documents';
const OBJECT_NOT_FOUND_ERROR_MESSAGE = 'OBJECT_NOT_FOUND';

/**
 * Parses the actual path and the bundle identifier from the given path string
 *
 * @this {XCUITestDriver}
 * @param {string} remotePath - The given path string. The string should
 * match `CONTAINER_PATH_PATTERN` regexp, otherwise an error is going
 * to be thrown. A valid string example: `@bundle.identifier:container_type/relative_path_in_container`
 * @param {import('./types').ContainerRootSupplier|string} [containerRootSupplier] - Container root path supplier function or string value
 * @returns {Promise<import('./types').ContainerObject>}
 */
export async function parseContainerPath(remotePath, containerRootSupplier) {
  const match = CONTAINER_PATH_PATTERN.exec(remotePath);
  if (!match) {
    throw new Error(
      `It is expected that package identifier ` +
        `starts with '${CONTAINER_PATH_MARKER}' and is separated from the ` +
        `relative path with a single slash. '${remotePath}' is given instead`,
    );
  }
  let [, bundleId, relativePath] = match;
  let containerType = null;
  const typeSeparatorPos = bundleId.indexOf(CONTAINER_TYPE_SEPARATOR);
  // We only consider container type exists if its length is greater than zero
  // not counting the colon
  if (typeSeparatorPos > 0 && typeSeparatorPos < bundleId.length - 1) {
    containerType = bundleId.substring(typeSeparatorPos + 1);
    this.log.debug(`Parsed container type: ${containerType}`);
    bundleId = bundleId.substring(0, typeSeparatorPos);
  }
  if (_.isNil(containerRootSupplier)) {
    const pathInContainer = relativePath;
    return {bundleId, pathInContainer, containerType};
  }
  const containerRoot = _.isFunction(containerRootSupplier)
    ? await containerRootSupplier(bundleId, containerType)
    : containerRootSupplier;
  const pathInContainer = path.posix.resolve(containerRoot, relativePath);
  verifyIsSubPath(pathInContainer, containerRoot);
  return {bundleId, pathInContainer, containerType};
}

/**
 *
 * @param {string} originalPath
 * @param {string} root
 * @returns {void}
 */
function verifyIsSubPath(originalPath, root) {
  const normalizedRoot = path.normalize(root);
  const normalizedPath = path.normalize(path.dirname(originalPath));
  // If originalPath is root, `/`, originalPath should equal to normalizedRoot
  if (normalizedRoot !== originalPath && !normalizedPath.startsWith(normalizedRoot)) {
    throw new Error(`'${normalizedPath}' is expected to be a subpath of '${normalizedRoot}'`);
  }
}

/**
 *
 * @this {XCUITestDriver}
 * @param {string} [bundleId]
 * @param {string} [containerType]
 * @returns {Promise<any>}
 */
async function createAfcClient(bundleId, containerType) {
  const udid = this.device.udid;

  if (!bundleId) {
    return await services.startAfcService(udid);
  }
  const service = await services.startHouseArrestService(udid);

  const {
    skipDocumentsContainerCheck = false,
  } = await this.settings.getSettings();

  if (skipDocumentsContainerCheck) {
    return service.vendContainer(bundleId);
  }

  return isDocumentsContainer(containerType)
    ? await service.vendDocuments(bundleId)
    : await service.vendContainer(bundleId);
}

/**
 *
 * @param {string} [containerType]
 * @returns {boolean}
 */
function isDocumentsContainer(containerType) {
  return _.toLower(containerType) === _.toLower(CONTAINER_DOCUMENTS_PATH);
}

/**
 *
 * @this {XCUITestDriver}
 * @param {string} remotePath
 * @returns {Promise<{service: any, relativePath: string}>}
 */
async function createService(remotePath) {
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(this)(remotePath);
    const service = await createAfcClient.bind(this)(bundleId, containerType);
    const relativePath = isDocumentsContainer(containerType)
      ? path.join(CONTAINER_DOCUMENTS_PATH, pathInContainer)
      : pathInContainer;
    return {service, relativePath};
  } else {
    const service = await createAfcClient.bind(this)();
    return {service, relativePath: remotePath};
  }
}

/**
 * Save the given base64 data chunk as a binary file on the Simulator under test.
 *
 * @this {XCUITestDriver}
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
async function pushFileToSimulator(remotePath, base64Data) {
  const buffer = Buffer.from(base64Data, 'base64');
  const device = /** @type {import('../driver').Simulator} */ (this.device);
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer: dstPath} = await parseContainerPath.bind(this)(
      remotePath,
      async (appBundle, containerType) =>
        await device.simctl.getAppContainer(appBundle, containerType),
    );
    this.log.info(
      `Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
        `Will put the data into '${dstPath}'`,
    );
    if (!(await fs.exists(path.dirname(dstPath)))) {
      this.log.debug(`The destination folder '${path.dirname(dstPath)}' does not exist. Creating...`);
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
 * @this {XCUITestDriver}
 * @param {string} remotePath - The remote path on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be uploaded to the corresponding
 *                              application container instead of the default media folder. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
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
async function pushFileToRealDevice(remotePath, base64Data) {
  const {service, relativePath} = await createService.bind(this)(remotePath);
  try {
    await pushFile(service, Buffer.from(base64Data, 'base64'), relativePath);
  } catch (e) {
    this.log.debug(e.stack);
    throw new Error(`Could not push the file to '${remotePath}'. Original error: ${e.message}`);
  } finally {
    service.close();
  }
}

/**
 *
 * @this {XCUITestDriver}
 * @param {string} remotePath
 * @returns {Promise<void>}
 */
async function deleteFileOrFolder(remotePath) {
  return this.isSimulator()
    ? await deleteFromSimulator.bind(this)(remotePath)
    : await deleteFromRealDevice.bind(this)(remotePath);
}

/**
 * Get the content of given file or folder from iOS Simulator and return it as base-64 encoded string.
 * Folder content is recursively packed into a zip archive.
 *
 * @this {XCUITestDriver}
 * @param {string} remotePath - The path to a file or a folder, which exists in the corresponding application
 *                              container on Simulator. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
 *                              format to pull a file or a folder from an application container of the given type.
 *                              Possible container types are `app`, `data`, `groups`, `<A specific App Group container>`.
 *                              The default type is `app`.
 * @param {boolean} isFile - Whether the destination item is a file or a folder
 * @returns {Promise<string>} Base-64 encoded content of the file.
 */
async function pullFromSimulator(remotePath, isFile) {
  let pathOnServer;
  const device = /** @type {import('../driver').Simulator} */ (this.device);
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer: dstPath} = await parseContainerPath.bind(this)(
      remotePath,
      async (appBundle, containerType) =>
        await device.simctl.getAppContainer(appBundle, containerType),
    );
    this.log.info(
      `Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
        `Will get the data from '${dstPath}'`,
    );
    pathOnServer = dstPath;
  } else {
    const simRoot = device.getDir();
    pathOnServer = path.posix.join(simRoot, remotePath);
    verifyIsSubPath(pathOnServer, simRoot);
    this.log.info(`Got the full item path: ${pathOnServer}`);
  }
  if (!(await fs.exists(pathOnServer))) {
    throw this.log.errorWithException(
      `The remote ${isFile ? 'file' : 'folder'} at '${pathOnServer}' does not exist`,
    );
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
 * @this {XCUITestDriver}
 * @param {string} remotePath - The path to an existing remote file on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be downloaded from the corresponding
 *                              application container instead of the default media folder. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
 *                              format to pull a file or a folder from an application container of the given type.
 *                              The only supported container type is 'documents'. If the container type is not set
 *                              explicitly for a bundle id, then the default application container is going to be mounted
 *                              (aka --container ifuse argument)
 *                              e.g. If `@com.myapp.bla:documents/111.png` is provided,
 *                                   `On My iPhone/<app name>` in Files app will be mounted in the host machine.
 *                                   `On My iPhone/<app name>/111.png` will be pulled into the mounted host machine
 *                                   and Appium returns the data as base64-encoded string to client.
 *                                   `@com.myapp.bla:documents/` means `On My iPhone/<app name>`.
 * @param {boolean} isFile - Whether the destination item is a file or a folder
 * @returns {Promise<string>} Base-64 encoded content of the remote file
 */
async function pullFromRealDevice(remotePath, isFile) {
  const {service, relativePath} = await createService.bind(this)(remotePath);
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
 * @this {XCUITestDriver}
 * @param {string} remotePath - The path to a file or a folder, which exists in the corresponding application
 *                              container on Simulator. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
 *                              format to pull a file or a folder from an application container of the given type.
 *                              Possible container types are 'app', 'data', 'groups', '<A specific App Group container>'.
 *                              The default type is 'app'.
 * @returns {Promise<void>}
 */
async function deleteFromSimulator(remotePath) {
  let pathOnServer;
  const device = /** @type {import('../driver').Simulator} */ (this.device);
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer: dstPath} = await parseContainerPath.bind(this)(
      remotePath,
      async (appBundle, containerType) =>
        await device.simctl.getAppContainer(appBundle, containerType),
    );
    this.log.info(
      `Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
        `'${dstPath}' will be deleted`,
    );
    pathOnServer = dstPath;
  } else {
    const simRoot = device.getDir();
    pathOnServer = path.posix.join(simRoot, remotePath);
    verifyIsSubPath(pathOnServer, simRoot);
    this.log.info(`Got the full path: ${pathOnServer}`);
  }
  if (!(await fs.exists(pathOnServer))) {
    throw new errors.InvalidArgumentError(`The remote path at '${pathOnServer}' does not exist`);
  }
  await fs.rimraf(pathOnServer);
}

/**
 * Remove the file or folder from the device
 *
 * @this {XCUITestDriver}
 * @param {string} remotePath - The path to an existing remote file on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be downloaded from the corresponding
 *                              application container instead of the default media folder. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
 *                              format to pull a file or a folder from an application container of the given type.
 *                              The only supported container type is 'documents'. If the container type is not set
 *                              explicitly for a bundle id, then the default application container is going to be mounted
 *                              (aka --container ifuse argument)
 *                              e.g. If `@com.myapp.bla:documents/111.png` is provided,
 *                                   `On My iPhone/<app name>` in Files app will be mounted in the host machine.
 *                                   `On My iPhone/<app name>/111.png` will be pulled into the mounted host machine
 *                                   and Appium returns the data as base64-encoded string to client.
 *                                   `@com.myapp.bla:documents/` means `On My iPhone/<app name>`.
 * @returns {Promise<void>}
 */
async function deleteFromRealDevice(remotePath) {
  const {service, relativePath} = await createService.bind(this)(remotePath);
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

export default {
  /**
   * Pushes the given data to a file on the remote device
   *
   * @param {string} remotePath The full path to the remote file or
   * a file inside a package bundle. Check the documentation on
   * `pushFileToRealDevice` and `pushFileToSimulator` for more information
   * on acceptable values.
   * @param {string} base64Data Base64 encoded data to be written to the
   * remote file. The remote file will be silently overridden if it already exists.
   * @throws {Error} If there was an error while pushing the data
   * @this {XCUITestDriver}
   */
  async pushFile(remotePath, base64Data) {
    if (remotePath.endsWith('/')) {
      throw new errors.InvalidArgumentError(
        `It is expected that remote path points to a file and not to a folder. ` +
          `'${remotePath}' is given instead`,
      );
    }
    if (_.isArray(base64Data)) {
      // some clients (ahem) java, send a byte array encoding utf8 characters
      // instead of a string, which would be infinitely better!
      base64Data = Buffer.from(base64Data).toString('utf8');
    }
    return this.isSimulator()
      ? await pushFileToSimulator.bind(this)(remotePath, base64Data)
      : await pushFileToRealDevice.bind(this)(remotePath, base64Data);
  },

  /**
   * Pushes the given data to a file on the remote device.
   *
   * @param {string} remotePath - The full path to the remote file
   * or a specially formatted path, which points to an item inside an app bundle.
   * @param {string} payload - Base64-encoded content of the file to be pushed.
   * @this {XCUITestDriver}
   */
  async mobilePushFile(remotePath, payload) {
    return await this.pushFile(remotePath, payload);
  },

  /**
   * Pulls a remote file from the device.
   *
   * @param {string} remotePath The full path to the remote file
   * or a specially formatted path, which points to an item inside app bundle.
   * See the documentation for `pullFromRealDevice` and `pullFromSimulator`
   * to get more information on acceptable values.
   * @returns {Promise<string>} Base64 encoded content of the pulled file
   * @throws {Error} If the pull operation failed
   * @this {XCUITestDriver}
   */
  async pullFile(remotePath) {
    if (remotePath.endsWith('/')) {
      throw new errors.InvalidArgumentError(
        `It is expected that remote path points to a file and not to a folder. ` +
          `'${remotePath}' is given instead`,
      );
    }
    return this.isSimulator()
      ? await pullFromSimulator.bind(this)(remotePath, true)
      : await pullFromRealDevice.bind(this)(remotePath, true);
  },

  /**
   * Pulls a remote file from the device.
   *
   * @param {string} remotePath - The full path to the remote file
   * or a specially formatted path, which points to an item inside app bundle.  See the documentation for `pullFromRealDevice` and `pullFromSimulator` to get more information on acceptable values.
   * @returns {Promise<string>} The same as in `pullFile`
   * @this {XCUITestDriver}
   */
  async mobilePullFile(remotePath) {
    return await this.pullFile(remotePath);
  },

  /**
   * Delete a remote folder from the device.
   *
   * @param {string} remotePath - The full path to the remote folder or a specially formatted path, which points to an item inside app bundle. See the documentation for `pullFromRealDevice` and `pullFromSimulator` to get more information on acceptable values.
   * @this {XCUITestDriver}
   * @returns {Promise<void>}
   */
  async mobileDeleteFolder(remotePath) {
    if (!remotePath.endsWith('/')) {
      remotePath = `${remotePath}/`;
    }
    await deleteFileOrFolder.bind(this)(remotePath);
  },

  /**
   * Delete a remote file from the device.
   *
   * @param {string} remotePath - The full path to the remote file or a specially formatted path, which points to an item inside app bundle. See the documentation for `pullFromRealDevice` and `pullFromSimulator` to get more information on acceptable values.
   * @this {XCUITestDriver}
   * @returns {Promise<void>}
   */
  async mobileDeleteFile(remotePath) {
    if (remotePath.endsWith('/')) {
      throw new errors.InvalidArgumentError(
        `It is expected that remote path points to a file and not to a folder. ` +
          `'${remotePath}' is given instead`,
      );
    }
    await deleteFileOrFolder.bind(this)(remotePath);
  },

  /**
   * Pulls the whole folder from the remote device
   *
   * @param {string} remotePath The full path to a folder on the
   * remote device or a folder inside an application bundle
   * @returns {Promise<string>} Zipped and base64-encoded content of the folder
   * @throws {Error} If there was a failure while getting the folder content
   * @this {XCUITestDriver}
   */
  async pullFolder(remotePath) {
    if (!remotePath.endsWith('/')) {
      remotePath = `${remotePath}/`;
    }
    return this.isSimulator()
      ? await pullFromSimulator.bind(this)(remotePath, false)
      : await pullFromRealDevice.bind(this)(remotePath, false);
  },

  /**
   * Pulls the whole folder from the device under test.
   *
   * @param {string} remotePath - The full path to the remote folder
   * @returns {Promise<string>} The same as `pullFolder`
   * @this {XCUITestDriver}
   */
  async mobilePullFolder(remotePath) {
    return await this.pullFolder(remotePath);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
