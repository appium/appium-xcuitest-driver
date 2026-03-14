#!/usr/bin/env node
/**
 * Test script for creating lockdown service, starting CoreDeviceProxy, and creating tunnel
 * This script demonstrates the tunnel creation workflow for all connected devices
 */
import {logger, node, fs} from 'appium/support.js';
import _ from 'lodash';

import {
  AppleTVTunnelService,
  PacketStreamServer,
  TunnelManager,
  createLockdownServiceByUDID,
  createUsbmux,
  startCoreDeviceProxy,
  startTunnelRegistryServer,
} from 'appium-ios-remotexpc';

import {strongbox} from '@appium/strongbox';
import path from 'node:path';
import {Command} from 'commander';

const log = logger.getLogger('TunnelCreation');
const TUNNEL_REGISTRY_PORT = 'tunnelRegistryPort';

/**
 * TunnelCreator class for managing tunnel creation and related operations (USB and optional Apple TV over WiFi).
 */
class TunnelCreator {
  constructor() {
    /** @type {Map<string, import('appium-ios-remotexpc').PacketStreamServer>} */
    this._packetStreamServers = new Map();
    /** @type {AppleTVTunnelResource[]} */
    this._appletvResources = [];
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
   * Update tunnel registry with USB and optional Apple TV tunnel entries.
   * @param {import('appium-ios-remotexpc').TunnelResult[]} usbResults - Array of USB tunnel results
   * @param {AppleTVRegistryEntry[]} [appletvEntries] - Optional Apple TV tunnel entries
   * @returns {Promise<import('appium-ios-remotexpc').TunnelRegistry>} Updated tunnel registry
   */
  async updateTunnelRegistry(usbResults, appletvEntries = []) {
    const now = Date.now();
    const nowISOString = new Date().toISOString();

    const registry = {
      tunnels: {},
      metadata: {
        lastUpdated: nowISOString,
        totalTunnels: 0,
        activeTunnels: 0,
      },
    };

    for (const result of usbResults) {
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
          createdAt: now,
          lastUpdated: now,
        };
      }
    }

    for (const entry of appletvEntries) {
      registry.tunnels[entry.udid] = {
        udid: entry.udid,
        deviceId: 0,
        address: entry.address,
        rsdPort: entry.rsdPort,
        packetStreamPort: entry.packetStreamPort,
        connectionType: 'WiFi',
        productId: 0,
        createdAt: now,
        lastUpdated: now,
      };
    }

    registry.metadata = {
      lastUpdated: nowISOString,
      totalTunnels: Object.keys(registry.tunnels).length,
      activeTunnels: Object.keys(registry.tunnels).length,
    };

    return registry;
  }

  /**
   * Cleanup resources for graceful shutdown
   */
  async cleanup() {
    log.warn('Cleaning up tunnel resources...');

    const usbEntries = [...this._packetStreamServers.entries()];
    const appletvResources = [...this._appletvResources];

    const closeUsbPacketStreamServers = (async () => {
      if (usbEntries.length === 0) {
        return;
      }
      log.info(`Closing ${usbEntries.length} packet stream server(s)...`);
      await Promise.allSettled(
        usbEntries.map(async ([udid, server]) => {
          try {
            await server.stop();
            log.info(`Closed packet stream server for device ${udid}`);
          } catch (err) {
            log.warn(`Failed to close packet stream server for device ${udid}: ${err}`);
          }
        }),
      );
      this._packetStreamServers.clear();
    })();

    const closeAppleTVTunnels = (async () => {
      if (appletvResources.length === 0) {
        return;
      }
      log.info(`Closing ${appletvResources.length} Apple TV tunnel(s)...`);
      await Promise.allSettled(
        appletvResources.map(async (resource) => {
          await teardownAppleTVTunnelResource(resource, resource.udid);
          log.info(`Closed Apple TV tunnel for ${resource.udid}`);
        }),
      );
      this._appletvResources.length = 0;
    })();

    await Promise.allSettled([closeUsbPacketStreamServers, closeAppleTVTunnels]);

    log.info('Cleanup completed.');
  }

  /**
   * Create tunnel for a single device
   * @param {import('appium-ios-remotexpc').UsbmuxDevice} device - Device object
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
   * Sets up tunnels for all connected USB devices. Does not start the registry server.
   * @param {import('appium-ios-remotexpc').Usbmux} usbmux - The usbmux object.
   * @param {string|undefined} specificUdid - A specific UDID to process, or undefined for all devices.
   * @param {import('tls').ConnectionOptions} tlsOptions - TLS options.
   * @returns {Promise<Array<import('appium-ios-remotexpc').TunnelResult>>} USB tunnel results (may be empty).
   */
  async setupTunnels(usbmux, specificUdid, tlsOptions) {
    log.info('Listing all connected devices...');
    const devices = await usbmux.listDevices();

    if (devices.length === 0) {
      log.info('No USB devices found.');
      return [];
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

    return results;
  }

  /**
   * Sets up tunnel(s) for paired Apple TV device(s) over WiFi. Uses a single tunnel when no
   * API to enumerate paired devices is available. Does not start the registry server.
   * @param {string|undefined} [specificDeviceId] - Optional Apple TV device identifier to target.
   * @returns {Promise<AppleTVRegistryEntry[]>} Apple TV registry entries.
   */
  async setupAppleTVTunnels(specificDeviceId) {
    /** @type {AppleTVRegistryEntry[]} */
    const entries = [];
    /** @type {import('appium-ios-remotexpc').AppleTVTunnelService | null} */
    let tunnelService = null;
    /** @type {AppleTVTunnelConnection | null} */
    let tunnel = null;
    /** @type {import('appium-ios-remotexpc').PacketStreamServer | null} */
    let packetStreamServer = null;
    /** @type {import('node:tls').TLSSocket | null} */
    let tlsSocket = null;

    try {
      log.info('Starting Apple TV tunnel (WiFi)...');
      tunnelService = new AppleTVTunnelService();
      const result = await tunnelService.startTunnel(
        undefined,
        specificDeviceId ?? undefined,
      );
      tlsSocket = result.socket;
      const deviceInfo = result.device;

      if (!tlsSocket) {
        log.warn('Apple TV TLS socket not established.');
        return entries;
      }

      log.info(`Creating tunnel for Apple TV: ${deviceInfo.identifier}`);
      tunnel = await TunnelManager.getTunnel(tlsSocket);

      const packetStreamPort = this._packetStreamBasePort++;
      packetStreamServer = new PacketStreamServer(packetStreamPort);
      await packetStreamServer.start();

      const consumer = packetStreamServer.getPacketConsumer();
      if (consumer && tunnel?.addPacketConsumer) {
        tunnel.addPacketConsumer(consumer);
      }
      log.info(`Apple TV packet stream server started on port ${packetStreamPort}`);

      this._appletvResources.push({
        tunnel,
        packetStreamServer,
        tunnelService,
        udid: deviceInfo.identifier,
        tlsSocket,
      });

      entries.push({
        udid: deviceInfo.identifier,
        address: tunnel.Address,
        rsdPort: tunnel.RsdPort ?? 0,
        packetStreamPort,
      });
      log.info(`✅ Apple TV tunnel ready for ${deviceInfo.identifier}`);
      return entries;
    } catch (err) {
      log.warn('Apple TV tunnel setup failed (ensure device is paired and on same network):', err?.message ?? err);
      // Clean up partially created resources so we don't leave a lingering WiFi connection
      if (tunnelService) {
        await teardownAppleTVTunnelResource(
          {tunnel, packetStreamServer, tunnelService, tlsSocket},
          'partially created',
        );
      }
      return entries;
    }
  }
}

/**
 * Tears down a single Apple TV tunnel resource (packet stream server, tunnel, tunnel service).
 * Each step runs in its own try/catch so one failure does not skip the rest.
 * @param {AppleTVTunnelTeardownInput} resource
 * @param {string} [label] - Label for log messages (e.g. device udid or 'partially created')
 */
async function teardownAppleTVTunnelResource(resource, label = 'Apple TV') {
  const {tunnel, packetStreamServer, tunnelService, tlsSocket} = resource;
  // Order aligned with remotexpc start-appletv-tunnel.ts: stop server, close tunnel, destroy socket, disconnect
  try {
    if (packetStreamServer) {
      await packetStreamServer.stop();
    }
  } catch (err) {
    log.warn(`Failed to stop packet stream server for ${label}: ${err}`);
  }
  try {
    if (_.isFunction(tunnel?.closer)) {
      await tunnel.closer();
    }
  } catch (err) {
    log.warn(`Failed to close tunnel for ${label}: ${err}`);
  }
  try {
    if (tlsSocket && !tlsSocket.destroyed) {
      tlsSocket.destroy();
    }
  } catch (err) {
    log.warn(`Failed to destroy TLS socket for ${label}: ${err}`);
  }
  try {
    if (tunnelService?.disconnect) {
      tunnelService.disconnect();
    }
  } catch (err) {
    log.warn(`Failed to disconnect tunnel service for ${label}: ${err}`);
  }
}

/**
 * Sets up signal and error handlers to ensure tunnels are cleaned up exactly once
 * and an appropriate process exit code is set on shutdown.
 *
 * @param {TunnelCreator} tunnelCreator
 * @returns {() => Promise<void>} cleanup function that can be awaited in a finally block
 */
function setupCleanupHandlers(tunnelCreator) {
  let shuttingDown = false;
  const cleanupOnce = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await tunnelCreator.cleanup();
    } catch (err) {
      log.warn(`Error during tunnel cleanup: ${err?.message ?? err}`);
    }
  };

  const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of shutdownSignals) {
    process.on(signal, () => {
      if (process.exitCode == null) {
        // Follow conventional POSIX exit codes for signals where possible.
        if (signal === 'SIGINT') {
          process.exitCode = 130;
        } else if (signal === 'SIGTERM') {
          process.exitCode = 143;
        } else {
          process.exitCode = 1;
        }
      }
      void cleanupOnce();
    });
  }

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection', reason);
    if (process.exitCode == null) {
      process.exitCode = 1;
    }
    void cleanupOnce();
  });

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', err);
    if (process.exitCode == null) {
      process.exitCode = 1;
    }
    void cleanupOnce();
  });

  return cleanupOnce;
}

async function main() {
  const program = new Command();
  program
    .name('appium driver run xcuitest tunnel-creation')
    .description('Create tunnels for connected iOS devices')
    .option('--udid <udid>', 'UDID of the device to create tunnel for')
    .option(
      '--packet-stream-base-port <port>',
      'Base port for packet stream servers (1-65535)',
      (value) => {
        const port = Number.parseInt(value, 10);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
          throw new Error(
            `Invalid packet stream base port: ${value}. Expected an integer between 1 and 65535.`,
          );
        }
        return port;
      },
    )
    .option(
      '--tunnel-registry-port <port>',
      'Port for the tunnel registry API server (1-65535)',
      (value) => {
        const port = Number.parseInt(value, 10);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
          throw new Error(
            `Invalid tunnel registry port: ${value}. Expected an integer between 1 and 65535.`,
          );
        }
        return port;
      },
    )
    .option(
      '--appletv-device-id <identifier>',
      'Apple TV device identifier to tunnel (from pair-appletv); omit to use first discovered paired device',
    );

  program.parse(process.argv);
  const options = program.opts();

  const tunnelCreator = new TunnelCreator();
  const cleanupOnce = setupCleanupHandlers(tunnelCreator);

  try {
    if (options.packetStreamBasePort !== undefined) {
      tunnelCreator.packetStreamBasePort = options.packetStreamBasePort;
    }
    if (options.tunnelRegistryPort !== undefined) {
      tunnelCreator.tunnelRegistryPort = options.tunnelRegistryPort;
    }
    const moduleRoot = node.getModuleRootSync('appium-xcuitest-driver', import.meta.url);
    if (!moduleRoot) {
      throw new Error('Cannot resolve module root for appium-xcuitest-driver');
    }

    const packageJson = await fs.readFile(path.join(moduleRoot, 'package.json'), 'utf8');
    const packageInfo = JSON.parse(packageJson);
    const box = strongbox(packageInfo.name);
    try {
      await box.createItemWithValue(
        TUNNEL_REGISTRY_PORT,
        String(tunnelCreator.tunnelRegistryPort),
      );
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
    /** @type {import('appium-ios-remotexpc').TunnelResult[]} */
    let usbResults = [];
    try {
      usbResults = await tunnelCreator.setupTunnels(usbmux, options.udid, tlsOptions);
    } finally {
      await usbmux.close();
    }

    // Automatically add paired Apple TV(s) over WiFi when available
    /** @type {AppleTVRegistryEntry[]} */
    const appletvEntries = await tunnelCreator.setupAppleTVTunnels(options.appletvDeviceId);

    const registry = await tunnelCreator.updateTunnelRegistry(usbResults, appletvEntries);
    const totalTunnels = Object.keys(registry.tunnels).length;

    if (totalTunnels === 0) {
      log.warn('No tunnels created (no USB devices and no Apple TV tunnel).');
      return;
    }

    await startTunnelRegistryServer(registry, tunnelCreator.tunnelRegistryPort);

    const successfulUsb = usbResults.filter((r) => r.success);
    log.info('\n=== TUNNEL CREATION SUMMARY ===');
    log.info(`USB tunnels: ${successfulUsb.length}`);
    log.info(`Apple TV (WiFi) tunnels: ${appletvEntries.length}`);
    log.info(`Total tunnels: ${totalTunnels}`);

    log.info('\n📁 Tunnel registry API:');
    log.info('   The tunnel registry is now available through the API at:');
    log.info(`   http://localhost:${tunnelCreator.tunnelRegistryPort}/remotexpc/tunnels`);
    log.info('\n   Available endpoints:');
    log.info('   - GET /remotexpc/tunnels - List all tunnels');
    log.info('   - GET /remotexpc/tunnels/:udid - Get tunnel by UDID');
    log.info('   - GET /remotexpc/tunnels/metadata - Get registry metadata');
    const firstUdid = successfulUsb[0]?.device?.Properties?.SerialNumber ?? appletvEntries[0]?.udid;
    if (firstUdid) {
      log.info(`   curl http://localhost:${tunnelCreator.tunnelRegistryPort}/remotexpc/tunnels/${firstUdid}`);
    }
  } finally {
    await cleanupOnce();
  }
}

await main();

/**
 * @typedef {Object} AppleTVRegistryEntry
 * Tunnel registry entry for an Apple TV (WiFi) device.
 * @property {string} udid
 * @property {string} address
 * @property {number} rsdPort
 * @property {number} packetStreamPort
 */

/**
 * @typedef {Object} AppleTVTunnelConnection
 * Tunnel connection returned from TunnelManager.getTunnel for an Apple TV (WiFi) socket.
 * @property {string} Address
 * @property {number} [RsdPort]
 * @property {(c: unknown) => void} [addPacketConsumer]
 * @property {() => Promise<void>} [closer]
 */

/**
 * @typedef {Object} AppleTVTunnelTeardownInput
 * Input for teardown of an Apple TV tunnel (full or partially created). All fields may be null if not yet created.
 * @property {AppleTVTunnelConnection | null} [tunnel]
 * @property {import('appium-ios-remotexpc').PacketStreamServer | null} [packetStreamServer]
 * @property {import('appium-ios-remotexpc').AppleTVTunnelService | null} [tunnelService]
 * @property {import('node:tls').TLSSocket | null} [tlsSocket]
 */

/**
 * @typedef {Object} AppleTVTunnelResource
 * Resource handle for cleanup of a single Apple TV (WiFi) tunnel.
 * @property {import('appium-ios-remotexpc').PacketStreamServer} packetStreamServer
 * @property {import('appium-ios-remotexpc').AppleTVTunnelService} tunnelService
 * @property {string} udid
 * @property {AppleTVTunnelConnection} tunnel
 * @property {import('node:tls').TLSSocket} tlsSocket
 */
