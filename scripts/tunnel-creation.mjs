#!/usr/bin/env node
/**
 * Test script for creating lockdown service, starting CoreDeviceProxy, and creating tunnel
 * This script demonstrates the tunnel creation workflow for all connected devices
 */
import {logger} from '@appium/support';
import _ from 'lodash';
import {
  PacketStreamServer,
  TunnelManager,
  createLockdownServiceByUDID,
  createUsbmux,
  startCoreDeviceProxy,
  startTunnelRegistryServer,
} from 'appium-ios-remotexpc';

const log = logger.getLogger('TunnelCreation');

/**
 * TunnelCreator class for managing tunnel creation and related operations
 */
class TunnelCreator {
  constructor() {
    this.packetStreamServers = new Map();
    // Default port value, will be updated in main() if --packet-stream-base-port is provided
    this.packetStreamBasePort = 50000;
    // Default port value, will be updated in main() if --tunnel-registry-port is provided
    this.tunnelRegistryPort = 42314;
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
      if (this.packetStreamServers.size > 0) {
        log.info(`Closing ${this.packetStreamServers.size} packet stream server(s)...`);
        for (const [udid, server] of this.packetStreamServers) {
          try {
            await server.stop();
            log.info(`Closed packet stream server for device ${udid}`);
          } catch (err) {
            log.warn(`Failed to close packet stream server for device ${udid}: ${err}`);
          }
        }
        this.packetStreamServers.clear();
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
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      log.error('Unhandled Rejection at:', promise, 'reason:', reason);
      await cleanup('Unhandled Rejection');
      process.exit(1);
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

    try {
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
      try {
        packetStreamPort = this.packetStreamBasePort++;
        const packetStreamServer = new PacketStreamServer(packetStreamPort);
        await packetStreamServer.start();

        const consumer = packetStreamServer.getPacketConsumer();
        if (consumer) {
          tunnel.addPacketConsumer(consumer);
        }

        this.packetStreamServers.set(udid, packetStreamServer);

        log.info(`Packet stream server started on port ${packetStreamPort}`);
      } catch (err) {
        throw new Error(`Failed to start packet stream server: ${err}`);
      }

      log.info(`✅ Tunnel creation completed successfully for device: ${udid}`);
      log.info(`   Tunnel Address: ${tunnel.Address}`);
      log.info(`   Tunnel RsdPort: ${tunnel.RsdPort}`);
      if (packetStreamPort) {
        log.info(`   Packet Stream Port: ${packetStreamPort}`);
      }

      try {
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
      } catch (err) {
        log.warn(`Could not add device to info server: ${err}`);

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
    } catch (error) {
      const errorMessage = `Failed to create tunnel for device ${udid}: ${error}`;
      throw new Error(`❌ ${errorMessage}`);
    }
  }
}

// Create an instance of TunnelCreator
const tunnelCreator = new TunnelCreator();

/**
 */
async function main() {
  tunnelCreator.setupCleanupHandlers();

  const args = process.argv.slice(2);
  const keepOpenFlag = args.includes('--keep-open') || args.includes('-k');
  
  // Extract UDID from command line arguments
  // If the first argument is provided and is not a flag, use it as the UDID
  let specificUdid = args.includes('--udid') || args.includes('-u');
  
  // Handle packet stream base port
  let packetStreamBasePortArg = args.find(arg => arg.startsWith('--packet-stream-base-port='));
  if (packetStreamBasePortArg) {
    tunnelCreator.packetStreamBasePort = parseInt(packetStreamBasePortArg.split('=')[1], 10);
    log.info(`Using packet stream base port: ${tunnelCreator.packetStreamBasePort}`);
  } else {
    const packetStreamBasePortIndex = args.indexOf('--packet-stream-base-port');
    if (packetStreamBasePortIndex !== -1 && packetStreamBasePortIndex + 1 < args.length) {
      tunnelCreator.packetStreamBasePort = parseInt(args[packetStreamBasePortIndex + 1], 10);
      log.info(`Using packet stream base port: ${tunnelCreator.packetStreamBasePort}`);
    }
  }

  let tunnelRegistryPortArg = args.find(arg => arg.startsWith('--tunnel-registry-port='));
  if (tunnelRegistryPortArg) {
    tunnelCreator.tunnelRegistryPort = parseInt(tunnelRegistryPortArg.split('=')[1], 10);
    log.info(`Using tunnel registry port: ${tunnelCreator.tunnelRegistryPort}`);
  } else {
    const tunnelRegistryPortIndex = args.indexOf('--tunnel-registry-port');
    if (tunnelRegistryPortIndex !== -1 && tunnelRegistryPortIndex + 1 < args.length) {
      tunnelCreator.tunnelRegistryPort = parseInt(args[tunnelRegistryPortIndex + 1], 10);
      log.info(`Using tunnel registry port: ${tunnelCreator.tunnelRegistryPort}`);
    }
  }

  if (specificUdid) {
    log.info(`Starting tunnel creation test for specific UDID: ${specificUdid}`);
  } else {
    log.info('Starting tunnel creation test for all connected devices');
  }

  if (keepOpenFlag) {
    log.info('Running in "keep connections open" mode for lsof inspection');
  }

  try {
    const tlsOptions = {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    };

    log.info('Connecting to usbmuxd...');
    const usbmux = await createUsbmux();

    log.info('Listing all connected devices...');
    const devices = await usbmux.listDevices();

    await usbmux.close();

    if (devices.length === 0) {
      log.warn('No devices found. Make sure iOS devices are connected and trusted.');
      process.exit(0);
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

    const results = [];

    for (const device of devicesToProcess) {
      const result = await tunnelCreator.createTunnelForDevice(device, tlsOptions);
      results.push(result);

      if (devicesToProcess.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    log.info('\n=== TUNNEL CREATION SUMMARY ===');
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    log.info(`Total devices processed: ${results.length}`);
    log.info(`Successful tunnels: ${successful.length}`);
    log.info(`Failed tunnels: ${failed.length}`);

    if (successful.length > 0) {
      log.info('\n✅ Successful tunnels:');
      const registry = await tunnelCreator.updateTunnelRegistry(results);
      await startTunnelRegistryServer(registry, tunnelCreator.tunnelRegistryPort);

      log.info('\n📁 Tunnel registry API:');
      log.info('   The tunnel registry is now available through the API at:');
      log.info(`   http://localhost:${tunnelCreator.tunnelRegistryPort}/remotexpc/tunnels`);
      log.info('\n   Available endpoints:');
      log.info('   - GET /remotexpc/tunnels - List all tunnels');
      log.info('   - GET /remotexpc/tunnels/:udid - Get tunnel by UDID');
      log.info('   - GET /remotexpc/tunnels/metadata - Get registry metadata');
      if (successful.length > 0) {
        const firstUdid = successful[0].device.Properties.SerialNumber;
        log.info(`   curl http://localhost:4723/remotexpc/tunnels/${firstUdid}`);
      }
    }
  } catch (error) {
    log.error(`Error during tunnel creation test: ${error}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(async (error) => {
  log.error(`Fatal error: ${error}`);
  process.exit(1);
});
