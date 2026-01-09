import _ from 'lodash';
import {fs, tempDir, mkdirp, zip, util} from 'appium/support';
import path from 'path';
import {
  pullFile as realDevicePullFile,
  pullFolder as realDevicePullFolder,
  pushFile as realDevicePushFile,
} from '../device/real-device-management';
import {errors} from 'appium/driver';
import type {Simulator} from 'appium-ios-simulator';
import type {XCUITestDriver} from '../driver';
import type {ContainerObject, ContainerRootSupplier} from './types';
import {isIos18OrNewer} from '../utils';
import {AfcClient} from '../device/afc-client';

//#region Type Definitions

interface ServiceResult {
  client: AfcClient;
  relativePath: string;
}

//#endregion

//#region Constants

const CONTAINER_PATH_MARKER = '@';
// https://regex101.com/r/PLdB0G/2
const CONTAINER_PATH_PATTERN = new RegExp(`^${CONTAINER_PATH_MARKER}([^/]+)/(.*)`);
const CONTAINER_TYPE_SEPARATOR = ':';
const CONTAINER_DOCUMENTS_PATH = 'Documents';
const OBJECT_NOT_FOUND_ERROR_MESSAGE = 'OBJECT_NOT_FOUND';

//#endregion

//#region Public Exported Functions

/**
 * Parses the actual path and the bundle identifier from the given path string.
 *
 * @param remotePath - Path string matching `CONTAINER_PATH_PATTERN`, e.g. `@bundle.id:container/relative/path`
 * @param containerRootSupplier - Container root path supplier or explicit root
 */
export async function parseContainerPath(
  this: XCUITestDriver,
  remotePath: string,
  containerRootSupplier?: ContainerRootSupplier | string,
): Promise<ContainerObject> {
  const match = CONTAINER_PATH_PATTERN.exec(remotePath);
  if (!match) {
    throw new Error(
      `It is expected that package identifier ` +
        `starts with '${CONTAINER_PATH_MARKER}' and is separated from the ` +
        `relative path with a single slash. '${remotePath}' is given instead`,
    );
  }
  const [, bundleIdMatch, relativePath] = match;
  let bundleId = bundleIdMatch;
  let containerType: string | null = null;
  const typeSeparatorPos = bundleId.indexOf(CONTAINER_TYPE_SEPARATOR);
  // We only consider container type exists if its length is greater than zero
  // not counting the colon
  if (typeSeparatorPos > 0) {
    if (typeSeparatorPos < bundleId.length - 1) {
      containerType = bundleId.substring(typeSeparatorPos + 1);
      this.log.debug(`Parsed container type: ${containerType}`);
    }
    // Always strip the colon and everything after it
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
 * Pushes the given data to a file on the remote device.
 *
 * @param remotePath The full path to the remote file or
 * a file inside a package bundle. Check the documentation on
 * `pushFileToRealDevice` and `pushFileToSimulator` for more information
 * on acceptable values.
 * @param base64Data Base64 encoded data to be written to the
 * remote file. The remote file will be silently overridden if it already exists.
 * @throws {Error} If there was an error while pushing the data
 */
export async function pushFile(
  this: XCUITestDriver,
  remotePath: string,
  base64Data: string | number[] | Buffer,
): Promise<void> {
  if (remotePath.endsWith('/')) {
    throw new errors.InvalidArgumentError(
      `It is expected that remote path points to a file and not to a folder. ` +
        `'${remotePath}' is given instead`,
    );
  }
  let b64StringData: string;
  if (_.isArray(base64Data)) {
    // some clients (ahem) java, send a byte array encoding utf8 characters
    // instead of a string, which would be infinitely better!
    b64StringData = Buffer.from(base64Data).toString('utf8');
  } else if (Buffer.isBuffer(base64Data)) {
    b64StringData = base64Data.toString('utf8');
  } else {
    b64StringData = base64Data as string;
  }
  return this.isSimulator()
    ? await pushFileToSimulator.bind(this)(remotePath, b64StringData)
    : await pushFileToRealDevice.bind(this)(remotePath, b64StringData);
}

/**
 * Pushes the given data to a file on the remote device.
 *
 * @param remotePath - The full path to the remote file
 * or a specially formatted path, which points to an item inside an app bundle.
 * @param payload - Base64-encoded content of the file to be pushed.
 */
export async function mobilePushFile(
  this: XCUITestDriver,
  remotePath: string,
  payload: string,
): Promise<void> {
  return await this.pushFile(remotePath, payload);
}

/**
 * Pulls a remote file from the device.
 *
 * @param remotePath The full path to the remote file
 * or a specially formatted path, which points to an item inside app bundle.
 * See the documentation for `pullFromRealDevice` and `pullFromSimulator`
 * to get more information on acceptable values.
 * @returns Base64 encoded content of the pulled file
 * @throws {Error} If the pull operation failed
 */
export async function pullFile(this: XCUITestDriver, remotePath: string): Promise<string> {
  if (remotePath.endsWith('/')) {
    throw new errors.InvalidArgumentError(
      `It is expected that remote path points to a file and not to a folder. ` +
        `'${remotePath}' is given instead`,
    );
  }
  return this.isSimulator()
    ? await pullFromSimulator.bind(this)(remotePath, true)
    : await pullFromRealDevice.bind(this)(remotePath, true);
}

/**
 * Pulls a remote file from the device.
 *
 * @param remotePath - The full path to the remote file
 * or a specially formatted path, which points to an item inside app bundle.  See the documentation for `pullFromRealDevice` and `pullFromSimulator` to get more information on acceptable values.
 * @returns The same as in `pullFile`
 */
export async function mobilePullFile(this: XCUITestDriver, remotePath: string): Promise<string> {
  return await this.pullFile(remotePath);
}

/**
 * Delete a remote folder from the device.
 *
 * @param remotePath - The full path to the remote folder or a specially formatted path, which points to an item inside app bundle. See the documentation for `pullFromRealDevice` and `pullFromSimulator` to get more information on acceptable values.
 * @returns Nothing
 */
export async function mobileDeleteFolder(this: XCUITestDriver, remotePath: string): Promise<void> {
  if (!remotePath.endsWith('/')) {
    remotePath = `${remotePath}/`;
  }
  await deleteFileOrFolder.bind(this)(remotePath);
}

/**
 * Delete a remote file from the device.
 *
 * @param remotePath - The full path to the remote file or a specially formatted path, which points to an item inside app bundle. See the documentation for `pullFromRealDevice` and `pullFromSimulator` to get more information on acceptable values.
 * @returns Nothing
 */
export async function mobileDeleteFile(this: XCUITestDriver, remotePath: string): Promise<void> {
  if (remotePath.endsWith('/')) {
    throw new errors.InvalidArgumentError(
      `It is expected that remote path points to a file and not to a folder. ` +
        `'${remotePath}' is given instead`,
    );
  }
  await deleteFileOrFolder.bind(this)(remotePath);
}

/**
 * Pulls the whole folder from the remote device
 *
 * @param remotePath The full path to a folder on the
 * remote device or a folder inside an application bundle
 * @returns Zipped and base64-encoded content of the folder
 * @throws {Error} If there was a failure while getting the folder content
 */
export async function pullFolder(this: XCUITestDriver, remotePath: string): Promise<string> {
  if (!remotePath.endsWith('/')) {
    remotePath = `${remotePath}/`;
  }
  return this.isSimulator()
    ? await pullFromSimulator.bind(this)(remotePath, false)
    : await pullFromRealDevice.bind(this)(remotePath, false);
}

/**
 * Pulls the whole folder from the device under test.
 *
 * @param remotePath - The full path to the remote folder
 * @returns The same as `pullFolder`
 */
export async function mobilePullFolder(this: XCUITestDriver, remotePath: string): Promise<string> {
  return await this.pullFolder(remotePath);
}

async function deleteFileOrFolder(this: XCUITestDriver, remotePath: string): Promise<void> {
  return this.isSimulator()
    ? await deleteFromSimulator.bind(this)(remotePath)
    : await deleteFromRealDevice.bind(this)(remotePath);
}

//#endregion

//#region Private Helper Functions

/**
 * Check if container type refers to documents container
 */
function isDocumentsContainer(containerType?: string | null): boolean {
  return _.toLower(containerType ?? '') === _.toLower(CONTAINER_DOCUMENTS_PATH);
}

/**
 * Verify that a path is a subpath of a root directory
 */
function verifyIsSubPath(originalPath: string, root: string): void {
  const normalizedRoot = path.normalize(root);
  const normalizedPath = path.normalize(path.dirname(originalPath));
  // If originalPath is root, `/`, originalPath should equal to normalizedRoot
  if (normalizedRoot !== originalPath && !normalizedPath.startsWith(normalizedRoot)) {
    throw new Error(`'${normalizedPath}' is expected to be a subpath of '${normalizedRoot}'`);
  }
}

/**
 * Create AFC client for file operations
 */
async function createAfcClient(
  this: XCUITestDriver,
  bundleId?: string | null,
  containerType?: string | null,
): Promise<AfcClient> {
  const udid = this.device.udid as string;
  const useIos18 = isIos18OrNewer(this.opts);

  if (bundleId) {
    const skipDocumentsCheck = this.settings.getSettings().skipDocumentsContainerCheck ?? false;
    return await AfcClient.createForApp(udid, bundleId, containerType ?? null, useIos18, skipDocumentsCheck);
  }

  return await AfcClient.createForDevice(udid, useIos18);
}

/**
 * Create service for file operations
 */
async function createService(
  this: XCUITestDriver,
  remotePath: string,
): Promise<ServiceResult> {
  if (CONTAINER_PATH_PATTERN.test(remotePath)) {
    const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(this)(remotePath);
    const client = await createAfcClient.bind(this)(bundleId, containerType);
    let relativePath = isDocumentsContainer(containerType)
      ? path.join(CONTAINER_DOCUMENTS_PATH, pathInContainer)
      : pathInContainer;
    // Ensure path starts with / for AFC operations
    if (!relativePath.startsWith('/')) {
      relativePath = `/${relativePath}`;
    }
    return {client, relativePath};
  } else {
    const client = await createAfcClient.bind(this)();
    return {client, relativePath: remotePath};
  }
}

/**
 * Save the given base64 data chunk as a binary file on the Simulator under test.
 *
 * @param remotePath - Remote path on the simulator. Supports bundle-id-prefixed format
 *                     (e.g. `@com.myapp.bla:data/path/in/container/file.png`) to target
 *                     application containers; otherwise uploads to the default media folder.
 * @param base64Data - Base-64 encoded content of the file to be uploaded.
 */
async function pushFileToSimulator(
  this: XCUITestDriver,
  remotePath: string,
  base64Data: string,
): Promise<void> {
  const buffer = Buffer.from(base64Data, 'base64');
  const device = this.device as Simulator;
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
 * Save the given base64 data chunk as a binary file on a real device.
 *
 * @param remotePath - Remote path on the device. Supports the same bundle-id-prefixed
 *                     format as simulator uploads (e.g. `@com.myapp.bla:documents/file.png`)
 *                     to target application containers; otherwise defaults to media folder.
 * @param base64Data - Base-64 encoded content of the file to be uploaded.
 */
async function pushFileToRealDevice(
  this: XCUITestDriver,
  remotePath: string,
  base64Data: string,
): Promise<void> {
  const {client, relativePath} = await createService.bind(this)(remotePath);
  try {
    await realDevicePushFile(client, Buffer.from(base64Data, 'base64'), relativePath);
  } catch (e) {
    this.log.debug((e as Error).stack);
    throw new Error(`Could not push the file to '${remotePath}'. Original error: ${(e as Error).message}`);
  } finally {
    client.close();
  }
}

/**
 * Get the content of given file or folder from iOS Simulator and return it as base-64 encoded string.
 * Folder content is recursively packed into a zip archive.
 *
 * @param remotePath - The path to a file or a folder, which exists in the corresponding application
 *                              container on Simulator. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
 *                              format to pull a file or a folder from an application container of the given type.
 *                              Possible container types are `app`, `data`, `groups`, `<A specific App Group container>`.
 *                              The default type is `app`.
 * @param isFile - Whether the destination item is a file or a folder
 * @returns Base-64 encoded content of the file.
 */
async function pullFromSimulator(
  this: XCUITestDriver,
  remotePath: string,
  isFile: boolean,
): Promise<string> {
  let pathOnServer;
  const device = this.device as Simulator;
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
 * @param remotePath - The path to an existing remote file on the device. This variable can be prefixed with
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
 * @param isFile - Whether the destination item is a file or a folder
 * @returns Base-64 encoded content of the remote file
 */
async function pullFromRealDevice(
  this: XCUITestDriver,
  remotePath: string,
  isFile: boolean,
): Promise<string> {
  const {client, relativePath} = await createService.bind(this)(remotePath);
  try {
    // Check if path is a directory
    const isDirectory = await client.isDirectory(relativePath);

    if (isFile && isDirectory) {
      throw new Error(`The requested path is not a file. Path: '${remotePath}'`);
    }
    if (!isFile && !isDirectory) {
      throw new Error(`The requested path is not a folder. Path: '${remotePath}'`);
    }

    return !isDirectory
      ? (await realDevicePullFile(client, relativePath)).toString('base64')
      : (await realDevicePullFolder(client, relativePath)).toString();
  } finally {
    client.close();
  }
}

/**
 * Remove the file or folder from the device
 *
 * @param remotePath - The path to a file or a folder, which exists in the corresponding application
 *                              container on Simulator. Use
 *                              `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>`
 *                              format to pull a file or a folder from an application container of the given type.
 *                              Possible container types are 'app', 'data', 'groups', '<A specific App Group container>'.
 *                              The default type is 'app'.
 * @returns Nothing
 */
async function deleteFromSimulator(this: XCUITestDriver, remotePath: string): Promise<void> {
  let pathOnServer: string;
  const device = this.device as Simulator;
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
 * @param remotePath - The path to an existing remote file on the device. This variable can be prefixed with
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
 * @returns Nothing
 */
async function deleteFromRealDevice(this: XCUITestDriver, remotePath: string): Promise<void> {
  const {client, relativePath} = await createService.bind(this)(remotePath);
  try {
    await client.deleteDirectory(relativePath);
  } catch (e) {
    if ((e as Error).message.includes(OBJECT_NOT_FOUND_ERROR_MESSAGE)) {
      throw new Error(`Path '${remotePath}' does not exist on the device`);
    }
    throw e;
  } finally {
    client.close();
  }
}

//#endregion

