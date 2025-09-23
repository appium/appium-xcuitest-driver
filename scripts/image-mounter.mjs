#!/usr/bin/env node
/**
 * Image mounter script for mounting and unmounting Personalized Developer Disk Image on iOS devices
 * This script provides a CLI interface to mount/unmount DDI via remote XPC services
 */

import {logger} from '@appium/support';
import {promises as fs} from 'fs';
import path from 'path';

const log = logger.getLogger('ImageMounter');

/**
 * ImageMounter class for managing image mounting and unmounting operations
 */
class ImageMounter {
  constructor() {
    this.remoteXPCModule = null;
  }

  async initializeRemoteXPC() {
    if (this.remoteXPCModule) {
      return this.remoteXPCModule;
    }

    try {
      this.remoteXPCModule = await import('appium-ios-remotexpc');
      return this.remoteXPCModule;
    } catch (error) {
      throw new Error(
        'appium-ios-remotexpc is not installed. Please install it using:\n' +
        'npm install appium-ios-remotexpc\n\n' +
        'Note: This is an optional dependency required for image mounting functionality.'
      );
    }
  }

  async validateFile(filePath, fileType) {
    try {
      const absolutePath = path.resolve(filePath);
      const stat = await fs.stat(absolutePath);

      if (!stat.isFile()) {
        throw new Error(`${fileType} path is not a file: ${absolutePath}`);
      }

      return absolutePath;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`${fileType} file not found: ${path.resolve(filePath)}`);
      }
      throw error;
    }
  }

  /**
   * Mount Personalized Developer Disk Image on device
   * @param {string} imagePath - Path to the .dmg file
   * @param {string} manifestPath - Path to the BuildManifest.plist file
   * @param {string} trustCachePath - Path to the .trustcache file
   * @param {string} udid - Device UDID (optional)
   */
  async mount(imagePath, manifestPath, trustCachePath, udid) {

    const [validatedImagePath, validatedManifestPath, validatedTrustCachePath] = await Promise.all([
      this.validateFile(imagePath, 'Image (.dmg)'),
      this.validateFile(manifestPath, 'Build Manifest (.plist)'),
      this.validateFile(trustCachePath, 'Trust Cache (.trustcache)')
    ]);

    const remoteXPC = await this.initializeRemoteXPC();
    const {Services, createUsbmux} = remoteXPC;

    let usbmux;
    try {
      log.info('Connecting to usbmuxd...');
      usbmux = await createUsbmux();

      const devices = await usbmux.listDevices();
      if (devices.length === 0) {
        throw new Error('No devices found. Make sure iOS devices are connected and trusted.');
      }

      let targetDevice;
      if (udid) {
        targetDevice = devices.find(device => device.Properties.SerialNumber === udid);
        if (!targetDevice) {
          throw new Error(
            `Device with UDID ${udid} not found. Available devices:\n` +
            devices.map(d => `  - ${d.Properties.SerialNumber}`).join('\n')
          );
        }
      } else {
        if (devices.length > 1) {
          log.warn(`Multiple devices found. Using first device: ${devices[0].Properties.SerialNumber}`);
          log.warn('Available devices:');
          devices.forEach(device => {
            log.warn(`  - ${device.Properties.SerialNumber}`);
          });
          log.warn('Use --udid flag to specify a specific device.');
        }
        targetDevice = devices[0];
      }

      const deviceUdid = targetDevice.Properties.SerialNumber;
      log.info(`Mounting image on device: ${deviceUdid}`);

      log.info('Starting mobile image mounter service...');
      const {mobileImageMounterService: imageMounterService} = await Services.startMobileImageMounterService(deviceUdid);

      try {
        if (await imageMounterService.isPersonalizedImageMounted()) {
          log.info('✅ Personalized image is already mounted on the device');
          return;
        }

        await imageMounterService.mount(
          validatedImagePath,
          validatedManifestPath,
          validatedTrustCachePath
        );

        log.info('✅ Image mounted successfully!');
      } finally {
        await imageMounterService.cleanup();
      }

    } finally {
      if (usbmux) {
        await usbmux.close();
      }
    }
  }

  /**
   * Unmount image from device
   * @param {string} udid - Device UDID (optional)
   * @param {string} mountPath - Mount path to unmount (optional)
   */
  async unmount(udid, mountPath = '/System/Developer') {

    const remoteXPC = await this.initializeRemoteXPC();
    const {Services, createUsbmux} = remoteXPC;

    let usbmux;
    try {
      log.info('Connecting to usbmuxd...');
      usbmux = await createUsbmux();

      const devices = await usbmux.listDevices();
      if (devices.length === 0) {
        throw new Error('No devices found. Make sure iOS devices are connected and trusted.');
      }

      let targetDevice;
      if (udid) {
        targetDevice = devices.find(device => device.Properties.SerialNumber === udid);
        if (!targetDevice) {
          throw new Error(
            `Device with UDID ${udid} not found. Available devices:\n` +
            devices.map(d => `  - ${d.Properties.SerialNumber}`).join('\n')
          );
        }
      } else {
        if (devices.length > 1) {
          log.warn(`Multiple devices found. Using first device: ${devices[0].Properties.SerialNumber}`);
          log.warn('Available devices:');
          devices.forEach(device => {
            log.warn(`  - ${device.Properties.SerialNumber}`);
          });
          log.warn('Use --udid flag to specify a specific device.');
        }
        targetDevice = devices[0];
      }

      const deviceUdid = targetDevice.Properties.SerialNumber;
      log.info(`Unmounting image from device: ${deviceUdid}`);
      log.info(`Mount path: ${mountPath}`);

      log.info('Starting mobile image mounter service...');
      const {mobileImageMounterService: imageMounterService} = await Services.startMobileImageMounterService(deviceUdid);

      try {
        await imageMounterService.unmountImage(mountPath);
        log.info('✅ Image unmounted successfully!');
      } finally {
        await imageMounterService.cleanup();
      }

    } finally {
      if (usbmux) {
        await usbmux.close();
      }
    }
  }
}

function parseArg(args, flagName) {
  const equalsArg = args.find((arg) => arg.startsWith(`${flagName}=`));
  if (equalsArg) {
    return equalsArg.split('=')[1];
  }

  const flagIndex = args.indexOf(flagName);
  if (flagIndex !== -1 && flagIndex + 1 < args.length) {
    return args[flagIndex + 1];
  }

  return undefined;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
Image Mounter CLI - Mount and unmount Developer Disk Images on iOS devices

USAGE:
  node image-mounter.mjs <command> [options] [files]

COMMANDS:
  mount      Mount a Developer Disk Image
  unmount    Unmount a Developer Disk Image
  help       Show this help message

MOUNT COMMAND:
  node image-mounter.mjs mount <image.dmg> <BuildManifest.plist> <image.trustcache>
  node image-mounter.mjs mount --image <path> --manifest <path> --trustcache <path>

  Positional arguments (must be in order):
    1. Image file (.dmg)
    2. Build Manifest file (.plist)
    3. Trust Cache file (.trustcache)

  Options:
    --image <path>       Path to the .dmg image file
    --manifest <path>    Path to the BuildManifest.plist file
    --trustcache <path>  Path to the .trustcache file
    --udid <udid>        Target device UDID (optional, uses first device if not specified)

UNMOUNT COMMAND:
  node image-mounter.mjs unmount [options]

  Options:
    --udid <udid>        Target device UDID (optional, uses first device if not specified)
    --mount-path <path>  Mount path to unmount (default: /System/Developer)

EXAMPLES:
  # Mount using positional arguments
  node image-mounter.mjs mount DeveloperDiskImage.dmg BuildManifest.plist DeveloperDiskImage.trustcache

  # Mount using flags
  node image-mounter.mjs mount --image DeveloperDiskImage.dmg --manifest BuildManifest.plist --trustcache DeveloperDiskImage.trustcache

  # Mount on specific device
  node image-mounter.mjs mount --udid <udid> DeveloperDiskImage.dmg BuildManifest.plist DeveloperDiskImage.trustcache

  # Unmount
  node image-mounter.mjs unmount

  # Unmount from specific device
  node image-mounter.mjs unmount --udid <udid>

NOTE:
  This script requires the 'appium-ios-remotexpc' package to be installed.
  Install it using: npm install appium-ios-remotexpc
`);
}


async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  const command = args[0];
  const imageMounter = new ImageMounter();

  try {
    switch (command) {
      case 'mount': {
        const udid = parseArg(args, '--udid');

        const imageFlag = parseArg(args, '--image');
        const manifestFlag = parseArg(args, '--manifest');
        const trustCacheFlag = parseArg(args, '--trustcache');

        let imagePath, manifestPath, trustCachePath;

        if (imageFlag || manifestFlag || trustCacheFlag) {
          if (!imageFlag || !manifestFlag || !trustCacheFlag) {
            throw new Error(
              'When using flags, all three files must be specified:\n' +
              '  --image <path>\n' +
              '  --manifest <path>\n' +
              '  --trustcache <path>'
            );
          }
          imagePath = imageFlag;
          manifestPath = manifestFlag;
          trustCachePath = trustCacheFlag;
        } else {
          const positionalArgs = args.slice(1).filter(arg => !arg.startsWith('--'));
          if (udid) {
            // Remove UDID from positional args if it was specified as a flag
            const udidIndex = positionalArgs.indexOf(udid);
            if (udidIndex > -1) {
              positionalArgs.splice(udidIndex, 1);
            }
          }

          if (positionalArgs.length !== 3) {
            throw new Error(
              'Mount command requires exactly 3 files in order:\n' +
              '  1. Image file (.dmg)\n' +
              '  2. Build Manifest file (.plist)\n' +
              '  3. Trust Cache file (.trustcache)\n\n' +
              `Received ${positionalArgs.length} files: ${positionalArgs.join(', ')}\n\n` +
              'Use "node image-mounter.mjs help" for usage examples.'
            );
          }

          [imagePath, manifestPath, trustCachePath] = positionalArgs;
        }

        await imageMounter.mount(imagePath, manifestPath, trustCachePath, udid);
        break;
      }

      case 'unmount': {
        const udid = parseArg(args, '--udid');
        const mountPath = parseArg(args, '--mount-path');

        await imageMounter.unmount(udid, mountPath);
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}\nUse "node image-mounter.mjs help" for usage information.`);
    }
  } catch (error) {
    log.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  log.info('\nReceived SIGINT. Exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('\nReceived SIGTERM. Exiting...');
  process.exit(0);
});

(async () => await main())();
