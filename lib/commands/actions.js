import _ from 'lodash';
import { fs, tempDir } from 'appium-support';
import path from 'path';
import log from '../logger';
import { exec } from 'teen_process';
import { addMedia, getAppContainer } from 'node-simctl';

const CONTAINER_PATH_MARKER = '@';
// https://regex101.com/r/PLdB0G/2
const CONTAINER_PATH_PATTERN = new RegExp(`^${CONTAINER_PATH_MARKER}([^/]+)/(.+)`);

let commands = {};

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

async function parseContainerPath (remotePath, containerRootSupplier) {
  const match = CONTAINER_PATH_PATTERN.exec(remotePath);
  if (!match) {
    log.errorAndThrow(`It is expected that package identifier is separated from the relative path with a single slash. ` +
                      `'${remotePath}' is given instead`);
  }
  const containerRoot = _.isFunction(containerRootSupplier) ?
    (await containerRootSupplier(match[1])) :
    containerRootSupplier;
  return [match[1], path.posix.resolve(containerRoot, match[2])];
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
 *                              '@com.myapp.bla/RelativePathInContainer/111.png'. The '@' character at the
 *                              beginning of the argument is mandatory in such case.
 *                              The relative folder path is ignored if the file is going to be uploaded
 *                              to the default media folder and only the file name is considered important.
 * @param {string} base64Data - Base-64 encoded content of the file to be uploaded.
 */
async function pushFileToSimulator (device, remotePath, base64Data) {
  if (remotePath.startsWith(CONTAINER_PATH_MARKER)) {
    const [bundleId, dstPath] = await parseContainerPath(remotePath,
      async (x) => await getAppContainer(device.udid, x));
    log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
             `Will put the data into '${dstPath}'`);
    if (!await fs.exists(path.dirname(dstPath))) {
      log.debug(`The destination folder '${path.dirname(dstPath)}' does not exist. Creating...`);
      await fs.mkdirp(path.dirname(dstPath));
    }
    await fs.writeFile(dstPath, new Buffer(base64Data, 'base64').toString('binary'), 'binary');
    return;
  }
  const dstFolder = await tempDir.tempDir();
  const dstPath = path.resolve(dstFolder, path.basename(remotePath));
  try {
    await fs.writeFile(dstPath, new Buffer(base64Data, 'base64').toString('binary'), 'binary');
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
  const mntRoot = await tempDir.tempDir();
  let isUnmountSuccessful = true;
  try {
    let dstPath = path.resolve(mntRoot, remotePath);
    let ifuseArgs = ['-u', device.udid, mntRoot];
    if (remotePath.startsWith(CONTAINER_PATH_MARKER)) {
      const [bundleId, pathInContainer] = await parseContainerPath(remotePath, mntRoot);
      dstPath = pathInContainer;
      log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
               `Will put the data into '${dstPath}'`);
      ifuseArgs = ['-u', device.udid, '--container', bundleId, mntRoot];
    }
    await mountDevice(device, ifuseArgs);
    isUnmountSuccessful = false;
    try {
      if (!await fs.exists(path.dirname(dstPath))) {
        log.debug(`The destination folder '${path.dirname(dstPath)}' does not exist. Creating...`);
        await fs.mkdirp(path.dirname(dstPath));
      }
      await fs.writeFile(dstPath, new Buffer(base64Data, 'base64').toString('binary'), 'binary');
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
 * Get the content of given file from iOS Simulator and return it as base-64 encoded string.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The path to a file, which exists in the corresponding application
 *                              container on Simulator. The expected format of this string:
 *                              @<app_bundle_id>/<path_to_the_file_inside_container>
 * @returns {string} Base-64 encoded content of the file.
 */
async function pullFileFromSimulator (device, remotePath) {
  if (!remotePath.startsWith(CONTAINER_PATH_MARKER)) {
    log.errorAndThrow(`Only pulling files from application containers is supported for iOS Simulator. ` +
                      `Provide the remote path in format @<bundle_id>/<path_to_the_file_in_its_container>`);
  }
  const [bundleId, dstPath] = await parseContainerPath(remotePath,
    async (x) => await getAppContainer(device.udid, x));
  log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
           `Will get the data from '${dstPath}'`);
  if (!await fs.exists(dstPath)) {
    log.errorAndThrow(`The remote file at '${dstPath}' does not exist`);
  }
  const data = await fs.readFile(dstPath);
  return new Buffer(data).toString('base64');
}

/**
 * Get the content of given file from the real device under test and return it as base-64 encoded string.
 *
 * @param {Object} device - The device object, which represents the device under test.
 *                          This object is expected to have the `udid` property containing the
 *                          valid device ID.
 * @param {string} remotePath - The path to an existing remote file on the device. This variable can be prefixed with
 *                              bundle id, so then the file will be downloaded from the corresponding
 *                              application container instead of the default media folder, for example
 *                              '@com.myapp.bla/RelativePathInContainer/111.png'. The '@' character at the
 *                              beginning of the argument is mandatory in such case.
 * @return {string} Base-64 encoded content of the remote file
 */
async function pullFileFromRealDevice (device, remotePath) {
  await verifyIFusePresence();
  const mntRoot = await tempDir.tempDir();
  let isUnmountSuccessful = true;
  try {
    let dstPath = path.resolve(mntRoot, remotePath);
    let ifuseArgs = ['-u', device.udid, mntRoot];
    if (remotePath.startsWith(CONTAINER_PATH_MARKER)) {
      const [bundleId, pathInContainer] = await parseContainerPath(remotePath, mntRoot);
      dstPath = pathInContainer;
      log.info(`Parsed bundle identifier '${bundleId}' from '${remotePath}'. ` +
               `Will get the data from '${dstPath}'`);
      ifuseArgs = ['-u', device.udid, '--container', bundleId, mntRoot];
    }
    await mountDevice(device, ifuseArgs);
    isUnmountSuccessful = false;
    try {
      if (!await fs.exists(dstPath)) {
        log.errorAndThrow(`The remote file at '${dstPath}' does not exist`);
      }
      const data = await fs.readFile(dstPath);
      return new Buffer(data).toString('base64');
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
  if (this.isSimulator()) {
    return await pushFileToSimulator(this.opts.device, remotePath, base64Data);
  }
  return await pushFileToRealDevice(this.opts.device, remotePath, base64Data);
};

commands.pullFile = async function (remotePath) {
  if (remotePath.endsWith('/')) {
    log.errorAndThrow(`It is expected that remote path points to a file and not to a folder. ` +
                      `'${remotePath}' is given instead`);
  }
  if (this.isSimulator()) {
    return await pullFileFromSimulator(this.opts.device, remotePath);
  }
  return await pullFileFromRealDevice(this.opts.device, remotePath);
};

function extractMandatoryOptions (opts = {}, keys) {
  const result = {};
  for (const key of keys) {
    const value = opts[key];
    if (!_.isString(value) || _.isEmpty(value)) {
      log.errorAndThrow(`'${key}' is expected to be a valid string. '${value}' is given instead`);
    }
    result[key] = value;
  }
  return result;
}

commands.mobileInstallApp = async function (opts = {}) {
  const {app} = extractMandatoryOptions(opts, ['app']);
  const dstPath = await this.helpers.configureApp(app, '.app');
  log.info(`Installing '${dstPath}' to the ${this.isRealDevice() ? 'real device' : 'Simulator'} ` +
           `with UDID ${this.opts.device.udid}`);
  if (!await fs.exists(dstPath)) {
    log.errorAndThrow(`The application at '${dstPath}' does not exist or is not accessible`);
  }
  try {
    await this.opts.device.installApp(dstPath);
    log.info(`Installation of '${dstPath}' succeeded`);
  } finally {
    if (dstPath !== app) {
      await fs.rimraf(dstPath);
    }
  }
};

commands.mobileIsAppInstalled = async function (opts = {}) {
  return await this.opts.device.isAppInstalled(extractMandatoryOptions(opts, ['bundleId']));
};

commands.mobileRemoveApp = async function (opts = {}) {
  const {bundleId} = extractMandatoryOptions(opts, ['bundleId']);
  log.info(`Uninstalling the application with bundle identifier '${bundleId}' ` +
    `from the ${this.isRealDevice() ? 'real device' : 'Simulator'} with UDID ${this.opts.device.udid}`);
  await this.opts.device.removeApp();
  log.info(`Removal of '${bundleId}' succeeded`);
};

commands.mobileLaunchApp = async function (opts = {}) {
  const wdaOpts = extractMandatoryOptions(opts, ['bundleId']);
  if (opts.arguments) {
    wdaOpts.arguments = _.isArray(opts.arguments) ? opts.arguments : [opts.arguments];
  }
  if (opts.environment) {
    wdaOpts.environment = opts.environment;
  }
  return await this.proxyCommand('/wda/apps/launch', 'POST', wdaOpts);
};

commands.mobileTerminateApp = async function (opts = {}) {
  return await this.proxyCommand('/wda/apps/terminate', 'POST', extractMandatoryOptions(opts, ['bundleId']));
};

commands.mobileActivateApp = async function (opts = {}) {
  return await this.proxyCommand('/wda/apps/activate', 'POST', extractMandatoryOptions(opts, ['bundleId']));
};

commands.mobileQueryAppState = async function (opts = {}) {
  return await this.proxyCommand('/wda/apps/state', 'POST', extractMandatoryOptions(opts, ['bundleId']));
};


export default commands;
