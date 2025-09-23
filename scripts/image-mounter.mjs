#!/usr/bin/env node
/**
 * Image mounter script for mounting and unmounting Personalized Developer Disk Image on iOS devices
 * This script provides a CLI interface to mount/unmount DDI via remote XPC services
 */

import {logger} from '@appium/support';
import {promises as fs} from 'fs';
import path from 'path';
import {Command} from 'commander';

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
        targetDevice = devices.find((device) => device.Properties.SerialNumber === udid);
        if (!targetDevice) {
          throw new Error(
            `Device with UDID ${udid} not found. Available devices:\n` +
            devices.map((d) => `  - ${d.Properties.SerialNumber}`).join('\n')
          );
        }
      } else {
        if (devices.length > 1) {
          log.warn(`Multiple devices found. Using first device: ${devices[0].Properties.SerialNumber}`);
          log.warn('Available devices:');
          devices.forEach((device) => {
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
        targetDevice = devices.find((device) => device.Properties.SerialNumber === udid);
        if (!targetDevice) {
          throw new Error(
            `Device with UDID ${udid} not found. Available devices:\n` +
            devices.map((d) => `  - ${d.Properties.SerialNumber}`).join('\n')
          );
        }
      } else {
        if (devices.length > 1) {
          log.warn(`Multiple devices found. Using first device: ${devices[0].Properties.SerialNumber}`);
          log.warn('Available devices:');
          devices.forEach((device) => {
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



/**
 * CLI with Commander.js
 */
async function main() {
  const program = new Command();
  const imageMounter = new ImageMounter();

  program
    .name('image-mounter.mjs')
    .description('Mount and unmount Developer Disk Images on iOS devices')
    .version('1.0.0')
    .addHelpText('after', `
NOTE:
  This script requires the 'appium-ios-remotexpc' package to be installed.
  Install it using: npm install appium-ios-remotexpc`);

  // Mount command
  program
    .command('mount')
    .description('Mount a Developer Disk Image on iOS device')
    .argument('[image]', 'Path to the .dmg image file')
    .argument('[manifest]', 'Path to the BuildManifest.plist file')
    .argument('[trustcache]', 'Path to the .trustcache file')
    .option('-i, --image <path>', 'Path to the .dmg image file')
    .option('-m, --manifest <path>', 'Path to the BuildManifest.plist file')
    .option('-t, --trustcache <path>', 'Path to the .trustcache file')
    .option('-u, --udid <udid>', 'Target device UDID (optional, uses first device if not specified)')
    .addHelpText('after', `
EXAMPLES:
  # Mount using positional arguments
  node image-mounter.mjs mount DeveloperDiskImage.dmg BuildManifest.plist DeveloperDiskImage.trustcache

  # Mount using flags
  node image-mounter.mjs mount --image DeveloperDiskImage.dmg --manifest BuildManifest.plist --trustcache DeveloperDiskImage.trustcache

  # Mount on specific device
  node image-mounter.mjs mount --udid <udid> DeveloperDiskImage.dmg BuildManifest.plist DeveloperDiskImage.trustcache`)
    .action(async (image, manifest, trustcache, options) => {
      try {
        let imagePath, manifestPath, trustCachePath;

        if (options.image || options.manifest || options.trustcache) {
          if (!options.image || !options.manifest || !options.trustcache) {
            throw new Error(
              'When using flags, all three files must be specified:\n' +
              '  --image <path>\n' +
              '  --manifest <path>\n' +
              '  --trustcache <path>\n\n' +
              'Use "node image-mounter.mjs mount --help" for usage examples.'
            );
          }
          imagePath = options.image;
          manifestPath = options.manifest;
          trustCachePath = options.trustcache;
        } else {
          if (!image || !manifest || !trustcache) {
            throw new Error(
              'Mount command requires exactly 3 files in order:\n' +
              '  1. Image file (.dmg)\n' +
              '  2. Build Manifest file (.plist)\n' +
              '  3. Trust Cache file (.trustcache)\n\n' +
              'Use "node image-mounter.mjs mount --help" for usage examples.'
            );
          }
          imagePath = image;
          manifestPath = manifest;
          trustCachePath = trustcache;
        }

        await imageMounter.mount(imagePath, manifestPath, trustCachePath, options.udid);
        process.exit(0);
      } catch (error) {
        log.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  // Unmount command
  program
    .command('unmount')
    .description('Unmount a Developer Disk Image from iOS device')
    .option('-u, --udid <udid>', 'Target device UDID (optional, uses first device if not specified)')
    .option('-p, --mount-path <path>', 'Mount path to unmount', '/System/Developer')
    .addHelpText('after', `
EXAMPLES:
  # Unmount from default path
  node image-mounter.mjs unmount

  # Unmount from specific device
  node image-mounter.mjs unmount --udid <udid>`)
    .action(async (options) => {
      try {
        await imageMounter.unmount(options.udid, options.mountPath);
        process.exit(0);
      } catch (error) {
        log.error(`❌ Error: ${error.message}`);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
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
