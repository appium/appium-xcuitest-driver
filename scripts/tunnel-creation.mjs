#!/usr/bin/env node
/**
 * Test script for creating lockdown service, starting CoreDeviceProxy, and creating tunnel
 * This script demonstrates the tunnel creation workflow for all connected devices
 */
import {logger, node} from 'appium/support.js';
import _ from 'lodash';

import {
  PacketStreamServer,
  TunnelManager,
  createLockdownServiceByUDID,
  createUsbmux,
  startCoreDeviceProxy,
  startTunnelRegistryServer,
} from 'appium-ios-remotexpc';

import {strongbox} from '@appium/strongbox';
import path from 'path';
import fs from 'fs';

const log = logger.getLogger('TunnelCreation');
const TUNNEL_REGISTRY_PORT = 'tunnelRegistryPort';

/**
 * TunnelCreator class for managing tunnel creation and related operations
 */
class TunnelCreator {
  constructor() {
    this._packetStreamServers = new Map();
    // Default port value, will be updated in main() if --packet-stream-base-port is provided
    this._packetStreamBasePort = 50000;
    // Default port value, will be updated in main() if --tunnel-registry-port is provided
    this._tunnelRegistryPort = 42314;
  }

  get packetStreamBasePort() {
    return this._packetStreamBasePort;
  }

  set packetStreamBasePort(port) {
    this._packetStreamBasePort = port;
  }

  get tunnelRegistryPort() {
    return this._tunnelRegistryPort;
  }

  set tunnelRegistryPort(port) {
    this._tunnelRegistryPort = port;
  }

  /**
   * Update tunnel registry with new tunnel information
   * @type {import('appium-ios-remotexpc').TunnelResult[]} results - Array of tunnel results
   * @returns {Promise<import('appium-ios-remotexpc').TunnelRegistry>} Updated tunnel registry
   */
  async updateTunnelRegistry(results) {
    const now = Date.now();
    const nowISOString = new Date().toISOString();

    // Initialize registry if it doesn't exist
    const registry = {
      tunnels: {},
      metadata: {
        lastUpdated: nowISOString,
        totalTunnels: 0,
        activeTunnels: 0,
      },
    };

    // Update tunnels
    for (const result of results) {
      if (result.success) {
        const udid = result.device.Properties.SerialNumber;
        registry.tunnels[udid] = {
          udid,
          deviceId: result.device.DeviceID,
          address: result.tunnel.Address,
          rsdPort: result.tunnel.RsdPort ?? 0,
          packetStreamPort: result.packetStreamPort,
          connectionType: result.device.Properties.ConnectionType,
          productId: result.device.Properties.ProductID,
          createdAt: registry.tunnels[udid]?.createdAt ?? now,
          lastUpdated: now,
        };
      }
    }

    // Update metadata
    registry.metadata = {
      lastUpdated: nowISOString,
      totalTunnels: Object.keys(registry.tunnels).length,
      activeTunnels: Object.keys(registry.tunnels).length, // Assuming all are active for now
    };

    return registry;
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  setupCleanupHandlers() {
    const cleanup = async (signal) => {
      log.warn(`\nReceived ${signal}. Cleaning up...`);

      // Close all packet stream servers
      if (this._packetStreamServers.size > 0) {
        log.info(`Closing ${this._packetStreamServers.size} packet stream server(s)...`);
        for (const [udid, server] of this._packetStreamServers) {
          try {
            await server.stop();
            log.info(`Closed packet stream server for device ${udid}`);
          } catch (err) {
            log.warn(`Failed to close packet stream server for device ${udid}: ${err}`);
          }
        }
        this._packetStreamServers.clear();
      }

      log.info('Cleanup completed. Exiting...');
      process.exit(0);
    };

    // Handle various termination signals
    process.on('SIGINT', () => cleanup('SIGINT (Ctrl+C)'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('SIGHUP', () => cleanup('SIGHUP'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', async (error) => {
      log.error('Uncaught Exception:', error);
      await cleanup('Uncaught Exception');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      log.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await cleanup('Unhandled Rejection');
    });
  }

  /**
   * Create tunnel for a single device
   * @param {Device} device - Device object
   * @param {import('tls').ConnectionOptions} tlsOptions - TLS options
   * @returns {Promise<import('appium-ios-remotexpc').TunnelResult & { socket?: any; socketInfo?: import('appium-ios-remotexpc').SocketInfo }>} Tunnel result
   */
  async createTunnelForDevice(device, tlsOptions) {
    const udid = device.Properties.SerialNumber;

    log.info(`\n--- Processing device: ${udid} ---`);
    log.info(`Device ID: ${device.DeviceID}`);
    log.info(`Connection Type: ${device.Properties.ConnectionType}`);
    log.info(`Product ID: ${device.Properties.ProductID}`);

    log.info('Creating lockdown service...');
    const {lockdownService, device: lockdownDevice} = await createLockdownServiceByUDID(udid);
    log.info(`Lockdown service created for device: ${lockdownDevice.Properties.SerialNumber}`);

    log.info('Starting CoreDeviceProxy...');
    const {socket} = await startCoreDeviceProxy(
      lockdownService,
      lockdownDevice.DeviceID,
      lockdownDevice.Properties.SerialNumber,
      tlsOptions,
    );
    log.info('CoreDeviceProxy started successfully');

    log.info('Creating tunnel...');
    const tunnel = await TunnelManager.getTunnel(socket);
    log.info(`Tunnel created for address: ${tunnel.Address} with RsdPort: ${tunnel.RsdPort}`);

    let packetStreamPort;
    packetStreamPort = this._packetStreamBasePort++;
    const packetStreamServer = new PacketStreamServer(packetStreamPort);
    await packetStreamServer.start();

    const consumer = packetStreamServer.getPacketConsumer();
    if (consumer) {
      tunnel.addPacketConsumer(consumer);
    }

    this._packetStreamServers.set(udid, packetStreamServer);

    log.info(`Packet stream server started on port ${packetStreamPort}`);

    log.info(`✅ Tunnel creation completed successfully for device: ${udid}`);
    log.info(`   Tunnel Address: ${tunnel.Address}`);
    log.info(`   Tunnel RsdPort: ${tunnel.RsdPort}`);
    if (packetStreamPort) {
      log.info(`   Packet Stream Port: ${packetStreamPort}`);
    }

    if (_.isFunction(socket?.setNoDelay)) {
      socket.setNoDelay(true);
    }

    return {
      device,
      tunnel: {
        Address: tunnel.Address,
        RsdPort: tunnel.RsdPort,
      },
      packetStreamPort,
      success: true,
      socket,
    };
  }

  /**
   * Sets up tunnels for all connected devices.
   * @param {import('appium-ios-remotexpc').Usbmux} usbmux - The usbmux object.
   * @param {string|undefined} specificUdid - A specific UDID to process, or undefined for all devices.
   * @param {import('tls').ConnectionOptions} tlsOptions - TLS options.
   */
  async setupTunnels(usbmux, specificUdid, tlsOptions) {
    log.info('Listing all connected devices...');
    const devices = await usbmux.listDevices();

    if (devices.length === 0) {
      log.warn('No devices found. Make sure iOS devices are connected and trusted.');
      return;
    }

    log.info(`Found ${devices.length} connected device(s):`);
    devices.forEach((device, index) => {
      log.info(`  ${index + 1}. UDID: ${device.Properties.SerialNumber}`);
      log.info(`     Device ID: ${device.DeviceID}`);
      log.info(`     Connection: ${device.Properties.ConnectionType}`);
      log.info(`     Product ID: ${device.Properties.ProductID}`);
    });

    let devicesToProcess = devices;
    if (specificUdid) {
      devicesToProcess = devices.filter(
        (device) => device.Properties.SerialNumber === specificUdid,
      );

      if (devicesToProcess.length === 0) {
        log.error(`Device with UDID ${specificUdid} not found in connected devices.`);
        log.error('Available devices:');
        devices.forEach((device) => {
          log.error(`  - ${device.Properties.SerialNumber}`);
        });
        process.exit(1);
      }
    }

    log.info(`\nProcessing ${devicesToProcess.length} device(s)...`);

    /** @type {import('appium-ios-remotexpc').TunnelResult[]} */
    const results = [];

    for (const device of devicesToProcess) {
      const result = await this.createTunnelForDevice(device, tlsOptions);
      results.push(result);
    }

    log.info('\n=== TUNNEL CREATION SUMMARY ===');
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    log.info(`Total devices processed: ${results.length}`);
    log.info(`Successful tunnels: ${successful.length}`);
    log.info(`Failed tunnels: ${failed.length}`);

    if (successful.length > 0) {
      log.info('\n✅ Successful tunnels:');
      const registry = await this.updateTunnelRegistry(results);
      await startTunnelRegistryServer(registry, this._tunnelRegistryPort);

      log.info('\n📁 Tunnel registry API:');
      log.info('   The tunnel registry is now available through the API at:');
      log.info(`   http://localhost:${this._tunnelRegistryPort}/remotexpc/tunnels`);
      log.info('\n   Available endpoints:');
      log.info('   - GET /remotexpc/tunnels - List all tunnels');
      log.info('   - GET /remotexpc/tunnels/:udid - Get tunnel by UDID');
      log.info('   - GET /remotexpc/tunnels/metadata - Get registry metadata');
      if (successful.length > 0) {
        const firstUdid = successful[0].device.Properties.SerialNumber;
        log.info(`   curl http://localhost:4723/remotexpc/tunnels/${firstUdid}`);
      }
    }
  }
}

/**
 * Helper function to parse string arguments
 * @param {string[]} args - Array of command line arguments
 * @param {string} flagName - Name of the flag to parse (e.g. '--udid')
 * @returns {string|undefined} The value of the flag if found, undefined otherwise
 */
function parseArg(args, flagName) {
  const equalsArg = args.find((arg) => arg.startsWith(`${flagName}=`));
  if (equalsArg) {
    const value = equalsArg.split('=')[1];
    log.info(`Using ${flagName.slice(2)}: ${value}`);
    return value;
  } else {
    const flagIndex = args.indexOf(flagName);
    if (flagIndex !== -1 && flagIndex + 1 < args.length) {
      const value = args[flagIndex + 1];
      log.info(`Using ${flagName.slice(2)}: ${value}`);
      return value;
    }
  }
  return undefined;
};

const BOOTSTRAP_PATH = node.getModuleRootSync('appium-xcuitest-driver', import.meta.url);

/**
 */
async function main() {
  // Create an instance of TunnelCreator
  const tunnelCreator = new TunnelCreator();
  tunnelCreator.setupCleanupHandlers();

  const args = process.argv.slice(2);

  const specificUdid = parseArg(args, '--udid');

  const packetStreamBasePort = parseArg(args, '--packet-stream-base-port');
  if (packetStreamBasePort !== undefined) {
    tunnelCreator.packetStreamBasePort = parseInt(packetStreamBasePort, 10);
  }

  const tunnelRegistryPort = parseArg(args, '--tunnel-registry-port');
  if (tunnelRegistryPort !== undefined) {
    tunnelCreator.tunnelRegistryPort = parseInt(tunnelRegistryPort, 10);
  }

  const packageInfo = JSON.parse(
    fs.readFileSync(path.join(BOOTSTRAP_PATH, 'package.json'), 'utf8'),
  );
  const box = strongbox(packageInfo.name);
  try {
    await box.createItemWithValue(TUNNEL_REGISTRY_PORT, String(tunnelCreator.tunnelRegistryPort));
  } catch (error) {
    throw new Error(`Tunnel registry port cannot be persisted: ${error.message}`);
  }

  /** @type {import('tls').ConnectionOptions} */
  const tlsOptions = {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2',
  };

  log.info('Connecting to usbmuxd...');
  const usbmux = await createUsbmux();

  try {
    await tunnelCreator.setupTunnels(usbmux, specificUdid, tlsOptions);
  } finally {
    await usbmux.close();
  }
}

(async () => await main())();
