#!/usr/bin/env node

import { logger } from '@appium/support';
import net from 'node:net';

import {
  PacketStreamServer,
  TunnelManager,
  createLockdownServiceByUDID,
  createUsbmux,
  startCoreDeviceProxy,
  startTunnelRegistryServer,
} from 'appium-ios-remotexpc';

const log = logger.getLogger('TunnelCreationTest');

/**
 * Update tunnel registry with new tunnel information
 * @param {Array} results - Array of tunnel results
 * @returns {Object} Updated tunnel registry
 */
async function updateTunnelRegistry(results) {
  const now = Date.now();
  const nowISOString = new Date().toISOString();
  
  const registry = {
    tunnels: {},
    metadata: {
      lastUpdated: nowISOString,
      totalTunnels: 0,
      activeTunnels: 0,
    }
  };

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

  registry.metadata = {
    lastUpdated: nowISOString,
    totalTunnels: Object.keys(registry.tunnels).length,
    activeTunnels: Object.keys(registry.tunnels).length, // Assuming all are active for now
  };

  return registry;
}

const activeServers = [];
const packetStreamServers = new Map();

const deviceInfoMap = new Map();

const INFO_SERVER_PORT = 49152;
let PACKET_STREAM_BASE_PORT = 50000;

/**
 * Create or get the info server that provides information about all devices
 * @returns {Promise<Object>} Server info object with server and port
 */
async function getInfoServer() {
  const existingServer = activeServers.find((s) => s.port === INFO_SERVER_PORT);
  if (existingServer) {
    return existingServer;
  }

  const server = net.createServer();

  server.on('connection', (conn) => {
    const devices = Array.from(deviceInfoMap.values());
    const responseJson = JSON.stringify({ devices }, null, 2);
    const httpResponse = [
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      `Content-Length: ${Buffer.byteLength(responseJson)}`,
      'Connection: close',
      '',
      responseJson,
    ].join('\r\n');

    conn.write(httpResponse);
    conn.end();
  });

  await new Promise((resolve, reject) => {
    server.listen(INFO_SERVER_PORT, '127.0.0.1', () => {
      resolve();
    });
    server.on('error', (err) => {
      reject(err);
    });
  });

  const serverInfo = { server, port: INFO_SERVER_PORT };
  activeServers.push(serverInfo);

  return serverInfo;
}

/**
 * Setup cleanup handlers for graceful shutdown
 */
function setupCleanupHandlers() {
  const cleanup = async (signal) => {
    log.warn(`\nReceived ${signal}. Cleaning up...`);

    if (packetStreamServers.size > 0) {
      log.info(
        `Closing ${packetStreamServers.size} packet stream server(s)...`,
      );
      for (const [udid, server] of packetStreamServers) {
        try {
          await server.stop();
          log.info(`Closed packet stream server for device ${udid}`);
        } catch (err) {
          log.warn(
            `Failed to close packet stream server for device ${udid}: ${err}`,
          );
        }
      }
      packetStreamServers.clear();
    }

    if (activeServers.length > 0) {
      log.info(`Closing ${activeServers.length} active server(s)...`);
      for (const serverInfo of activeServers) {
        try {
          serverInfo.server.close();
          log.info(`Closed server on port ${serverInfo.port}`);
        } catch (err) {
          log.warn(`Failed to close server on port ${serverInfo.port}: ${err}`);
        }
      }
    }

    log.info('Cleanup completed. Exiting...');
    process.exit(0);
  };

  process.on('SIGINT', () => cleanup('SIGINT (Ctrl+C)'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  process.on('SIGHUP', () => cleanup('SIGHUP'));

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
 * @typedef {Object} SocketInfo
 * @property {Object} server - Server object
 * @property {number} port - Server port
 * @property {Object} deviceInfo - Device information
 * @property {string} deviceInfo.udid - Device UDID
 * @property {string} deviceInfo.address - Device address
 * @property {number} [deviceInfo.rsdPort] - Device RSD port
 */

/**
 * Create tunnel for a single device
 * @param {Object} device - Device object
 * @param {Object} tlsOptions - TLS options
 * @returns {Promise<Object>} Tunnel result
 */
async function createTunnelForDevice(device, tlsOptions) {
  const udid = device.Properties.SerialNumber;

  try {
    log.info(`\n--- Processing device: ${udid} ---`);
    log.info(`Device ID: ${device.DeviceID}`);
    log.info(`Connection Type: ${device.Properties.ConnectionType}`);
    log.info(`Product ID: ${device.Properties.ProductID}`);

    log.info('Creating lockdown service...');
    const { lockdownService, device: lockdownDevice } =
      await createLockdownServiceByUDID(udid);
    log.info(
      `Lockdown service created for device: ${lockdownDevice.Properties.SerialNumber}`,
    );

    log.info('Starting CoreDeviceProxy...');
    const { socket } = await startCoreDeviceProxy(
      lockdownService,
      lockdownDevice.DeviceID,
      lockdownDevice.Properties.SerialNumber,
      tlsOptions,
    );
    log.info('CoreDeviceProxy started successfully');

    log.info('Creating tunnel...');
    const tunnel = await TunnelManager.getTunnel(socket);
    log.info(
      `Tunnel created for address: ${tunnel.Address} with RsdPort: ${tunnel.RsdPort}`,
    );

    let packetStreamPort;
    try {
      packetStreamPort = PACKET_STREAM_BASE_PORT++;
      const packetStreamServer = new PacketStreamServer(packetStreamPort);
      await packetStreamServer.start();

      const consumer = packetStreamServer.getPacketConsumer();
      if (consumer) {
        tunnel.addPacketConsumer(consumer);
      }

      packetStreamServers.set(udid, packetStreamServer);

      log.info(`Packet stream server started on port ${packetStreamPort}`);
    } catch (err) {
      log.warn(`Failed to start packet stream server: ${err}`);
    }

    log.info(`✅ Tunnel creation completed successfully for device: ${udid}`);
    log.info(`   Tunnel Address: ${tunnel.Address}`);
    log.info(`   Tunnel RsdPort: ${tunnel.RsdPort}`);
    if (packetStreamPort) {
      log.info(`   Packet Stream Port: ${packetStreamPort}`);
    }

    try {
      if (socket && typeof socket === 'object' && socket.setNoDelay) {
        socket.setNoDelay(true);
      }

      const deviceInfo = {
        udid: device.Properties.SerialNumber,
        address: tunnel.Address,
        rsdPort: tunnel.RsdPort,
        connectionType: device.Properties.ConnectionType,
        productId: device.Properties.ProductID,
      };

      deviceInfoMap.set(device.Properties.SerialNumber, deviceInfo);

      const serverInfo = await getInfoServer();

      log.info(
        `Added device ${device.Properties.SerialNumber} to info server on port ${serverInfo.port}`,
      );
      log.info(`To get all device info: curl localhost:${serverInfo.port}`);

      return {
        device,
        tunnel: {
          Address: tunnel.Address,
          RsdPort: tunnel.RsdPort,
        },
        packetStreamPort,
        success: true,
        socket,
        socketInfo: {
          server: serverInfo.server,
          port: serverInfo.port,
          deviceInfo,
        },
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
    log.error(`❌ ${errorMessage}`);
    return {
      device,
      tunnel: { Address: '', RsdPort: 0 },
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Main function
 */
async function main() {
  setupCleanupHandlers();

  const args = process.argv.slice(2);
  const keepOpenFlag = args.includes('--keep-open') || args.includes('-k');
  const specificUdid = args.find((arg) => !arg.startsWith('-'));

  if (specificUdid) {
    log.info(
      `Starting tunnel creation test for specific UDID: ${specificUdid}`,
    );
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
      log.warn(
        'No devices found. Make sure iOS devices are connected and trusted.',
      );
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
        log.error(
          `Device with UDID ${specificUdid} not found in connected devices.`,
        );
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
      const result = await createTunnelForDevice(device, tlsOptions);
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
      const registry = await updateTunnelRegistry(results);
      await startTunnelRegistryServer(registry);

      log.info('\n📁 Tunnel registry API:');
      log.info('   The tunnel registry is now available through the API at:');
      log.info('   http://localhost:42314/remotexpc/tunnels');
      log.info('\n   Available endpoints:');
      log.info('   - GET /remotexpc/tunnels - List all tunnels');
      log.info('   - GET /remotexpc/tunnels/:udid - Get tunnel by UDID');
      log.info('   - GET /remotexpc/tunnels/metadata - Get registry metadata');

      log.info('\n💡 Example usage:');
      log.info('   curl http://localhost:4723/remotexpc/tunnels');
      log.info('   curl http://localhost:4723/remotexpc/tunnels/metadata');
      if (successful.length > 0) {
        const firstUdid = successful[0].device.Properties.SerialNumber;
        log.info(
          `   curl http://localhost:4723/remotexpc/tunnels/${firstUdid}`,
        );
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
