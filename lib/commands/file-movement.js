import _ from 'lodash';
import { system, fs, tempDir, mkdirp, zip } from 'appium-support';
import path from 'path';
import { iosCommands } from 'appium-ios-driver';
import log from '../logger';
import { exec } from 'teen_process';
import { addMedia, getAppContainer } from 'node-simctl';

const CONTAINER_PATH_MARKER = '@';
// https://regex101.com/r/PLdB0G/2
const CONTAINER_PATH_PATTERN = new RegExp(`^${CONTAINER_PATH_MARKER}([^/]+)/(.+)`);
const CONTAINER_TYPE_SEPARATOR = ':';


let commands = iosCommands.file;

async function verifyIFusePresence () {
  if (!await fs.which('ifuse')) {
    log.errorAndThrow(`'ifuse' tool is required to be installed on the machine. ` +
                      `Install it using 'brew cask install osxfuse && brew install ifuse' or check ` +
                      `if it is available in PATH environment variable if the tool is already installed. ` +
                      `Current PATH value: ${process.env.PATH}`);
  }
}

async function mountDevice (device, iFuseArgs) {
  log.debug(`Starting ifuse with args '${iFuseArgs}'...`);
  try {
    await exec('ifuse', iFuseArgs);
  } catch (e) {
    log.errorAndThrow(`Cannot mount the media folder of the device with UDID ${device.udid}. ` +
                      `Make sure osxfuse plugin has necessary permissions in System Preferences->Security & Privacy. ` +
                      `Error code: ${e.code}; stderr output: ${e.stderr}`);
  }
}

function verifyIsSubPath (originalPath, root) {
  const normalizedRoot = path.normalize(root);
  const normalizedPath = path.normalize(path.dirname(originalPath));
  if (!normalizedPath.startsWith(normalizedRoot)) {
    log.errorAndThrow(`'${normalizedPath}' is expected to be a subpath of '${normalizedRoot}'`);
  }
}

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
 * @returns {Array<string>} - An array where the first item is the parsed bundle
 * identifier and the second one is the absolute full path of the item on the local
 * file system
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
  const containerRoot = _.isFunction(containerRootSupplier)
    ? await containerRootSupplier(bundleId, containerType)
    : containerRootSupplier;
  const resultPath = path.posix.resolve(containerRoot, relativePath);
  verifyIsSubPath(resultPath, containerRoot);
  return [bundleId, resultPath];
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
    const [bundleId, dstPath] = await parseContainerPath(remotePath,
      async (appBundle, containerType) => await getAppContainer(device.udid, appBundle, null, containerType));
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
    await addMedia(device.udid, dstPath);
  } finally {
    await fs.rimraf(dstFolder);
  }
}

/**
 * Save the given base64 data chunk as a binary file on the device under test.
 * ifuse/osxfuse should be installed and configured on the target machine in order
 * for this function to work properly. Read https://github.com/libimobiledevice/ifuse
 * and https://github.com/osxfuse/osxfuse/wiki/FAQ for more details.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The remote path on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be uploaded to the corresponding
 *                              application container instead of the default media folder, for example
 *                              '@com.myapp.bla/RelativePathInContainer/111.png'. The '@' character at the
 *                              beginning of the argument is mandatory in such case.
 * @param {string} base64Data - Base-64 encoded content of the file to be uploaded.
 */
async function pushFileToRealDevice (device, remotePath, base64Data) {
  await verifyIFusePresence();
  const mntRoot = await tempDir.openDir();
  let isUnmountSuccessful = true;
  try {
    let dstPath = path.resolve(mntRoot, remotePath);
    let ifuseArgs = ['-u', device.udid, mntRoot];
    if (CONTAINER_PATH_PATTERN.test(remotePath)) {
      const [bundleId, pathInContainer] = await parseContainerPath(remotePath, mntRoot);
      dstPath = pathInContainer;
      log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
        `Will put the data into '${dstPath}'`);
      ifuseArgs = ['-u', device.udid, '--container', bundleId, mntRoot];
    } else {
      verifyIsSubPath(dstPath, mntRoot);
    }
    await mountDevice(device, ifuseArgs);
    isUnmountSuccessful = false;
    try {
      if (!await fs.exists(path.dirname(dstPath))) {
        log.debug(`The destination folder '${path.dirname(dstPath)}' does not exist. Creating...`);
        await mkdirp(path.dirname(dstPath));
      }
      await fs.writeFile(dstPath, Buffer.from(base64Data, 'base64'));
    } finally {
      await exec('umount', [mntRoot]);
      isUnmountSuccessful = true;
    }
  } finally {
    if (isUnmountSuccessful) {
      await fs.rimraf(mntRoot);
    } else {
      log.warn(`Umount has failed, so not removing '${mntRoot}'`);
    }
  }
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
    const [bundleId, dstPath] = await parseContainerPath(remotePath,
      async (appBundle, containerType) => await getAppContainer(device.udid, appBundle, null, containerType));
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
    ? await fs.readFile(pathOnServer)
    : await zip.toInMemoryZip(pathOnServer);
  return Buffer.from(buffer).toString('base64');
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
 *                              application container instead of the default media folder, for example
 *                              '@com.myapp.bla/RelativePathInContainer/111.png'. The '@' character at the
 *                              beginning of the argument is mandatory in such case.
 * @param {boolean} isFile - Whether the destination item is a file or a folder
 * @return {string} Base-64 encoded content of the remote file
 */
async function pullFromRealDevice (device, remotePath, isFile) {
  await verifyIFusePresence();
  const mntRoot = await tempDir.openDir();
  let isUnmountSuccessful = true;
  try {
    let dstPath = path.resolve(mntRoot, remotePath);
    let ifuseArgs = ['-u', device.udid, mntRoot];
    if (CONTAINER_PATH_PATTERN.test(remotePath)) {
      const [bundleId, pathInContainer] = await parseContainerPath(remotePath, mntRoot);
      dstPath = pathInContainer;
      log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
        `Will get the data from '${dstPath}'`);
      ifuseArgs = ['-u', device.udid, '--container', bundleId, mntRoot];
    } else {
      verifyIsSubPath(dstPath, mntRoot);
    }
    await mountDevice(device, ifuseArgs);
    isUnmountSuccessful = false;
    try {
      if (!await fs.exists(dstPath)) {
        log.errorAndThrow(`The remote ${isFile ? 'file' : 'folder'} at '${dstPath}' does not exist`);
      }
      const buffer = isFile
        ? await fs.readFile(dstPath)
        : await zip.toInMemoryZip(dstPath);
      return Buffer.from(buffer).toString('base64');
    } finally {
      await exec('umount', [mntRoot]);
      isUnmountSuccessful = true;
    }
  } finally {
    if (isUnmountSuccessful) {
      await fs.rimraf(mntRoot);
    } else {
      log.warn(`Umount has failed, so not removing '${mntRoot}'`);
    }
  }
}


commands.pushFile = async function (remotePath, base64Data) {
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

commands.pullFile = async function (remotePath) {
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
                      `'${remotePath}' is given instead`);
  }
  return this.isSimulator()
    ? await pullFromSimulator(this.opts.device, remotePath, true)
    : await pullFromRealDevice(this.opts.device, remotePath, true);
};

commands.getSimFileFullPath = async function (remotePath) {
  let basePath = this.opts.device.getDir();
  let appName = null;

  if (this.opts.app) {
    let appNameRegex = new RegExp(`\\${path.sep}([\\w-]+\\.app)`);
    let appNameMatches = appNameRegex.exec(this.opts.app);
    if (appNameMatches) {
      appName = appNameMatches[1];
    }
  }
  // de-absolutize the path
  if (system.isWindows()) {
    if (remotePath.indexof('://') === 1) {
      remotePath = remotePath.slice(4);
    }
  } else {
    if (remotePath.indexOf('/') === 0) {
      remotePath = remotePath.slice(1);
    }
  }

  if (remotePath.indexOf(appName) === 0) {
    let findPath = basePath;
    if (this.opts.platformVersion >= 8) {
      // the .app file appears in /Containers/Data and /Containers/Bundle both. We only want /Bundle
      findPath = path.resolve(basePath, 'Containers', 'Bundle');
    }
    findPath = findPath.replace(/\s/g, '\\ ');

    let { stdout } = await exec('find', [findPath, '-name', appName]);
    let appRoot = stdout.replace(/\n$/, '');
    let subPath = remotePath.substring(appName.length + 1);
    let fullPath = path.resolve(appRoot, subPath);
    log.debug(`Finding app-relative file: '${fullPath}'`);
    return fullPath;
  } else {
    let fullPath = path.resolve(basePath, remotePath);
    log.debug(`Finding sim-relative file: ${fullPath}`);
    return fullPath;
  }
};

commands.pullFolder = async function (remotePath) {
  if (!remotePath.endsWith('/')) {
    remotePath = `${remotePath}/`;
  }
  return this.isSimulator()
    ? await pullFromSimulator(this.opts.device, remotePath, false)
    : await pullFromRealDevice(this.opts.device, remotePath, false);
};

export { commands };
export default commands;
