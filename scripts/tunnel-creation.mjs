#!/usr/bin/env node
/**
 * Test script for creating lockdown service, starting CoreDeviceProxy, and creating tunnel
 * This script demonstrates the tunnel creation workflow for all connected devices
 */
import {logger} from 'appium/support.js';
import _ from 'lodash';

import {
  AppleTVTunnelService,
  PacketStreamServer,
  TunnelManager,
  createLockdownServiceByUDID,
  createUsbmux,
  startCoreDeviceProxy,
  startTunnelRegistryServer,
  TUNNEL_CONTAINER_NAME,
  watchTunnelRegistrySockets,
} from 'appium-ios-remotexpc';

import {strongbox, BaseItem} from '@appium/strongbox';
import {Command} from 'commander';

const log = logger.getLogger('TunnelCreation');
const TUNNEL_REGISTRY_PORT = 'tunnelRegistryPort';

/**
 * @param {string} value
 * @param {string} label
 * @returns {number}
 */
function parsePortOption(value, label) {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid ${label}: ${value}. Expected an integer between 1 and 65535.`);
  }
  return port;
}

/**
 * @param {string} value
 * @param {string} label
 * @returns {number}
 */
function parseNonNegativeIntegerOption(value, label) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Invalid ${label}: ${value}. Expected an integer >= 0.`);
  }
  return count;
}

/**
 * @param {string} value
 * @param {string} label
 * @returns {number}
 */
function parsePositiveIntegerOption(value, label) {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid ${label}: ${value}. Expected a positive integer.`);
  }
  return num;
}

/**
 * @param {string} value
 * @param {string[]} previous
 * @returns {string[]}
 */
function collectStringValues(value, previous = []) {
  previous.push(value);
  return previous;
}

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
    /** @type {import('appium-ios-remotexpc').TunnelRegistry | null} */
    this._registry = null;
    /** @type {Map<string, import('appium-ios-remotexpc').UsbmuxDevice>} */
    this._usbDevices = new Map();
    /** @type {Map<string, Promise<void>>} */
    this._reconnectTasks = new Map();
    /** @type {Array<() => void | Promise<void>>} */
    this._registryWatcherStops = [];
    /** @type {WatchTunnelRegistrySocketsFn | null} */
    this._watchTunnelRegistrySocketsFn = null;
    /** @type {Set<string>} */
    this._appleTVDeviceIds = new Set();
    this._isCleaningUp = false;
    /** @type {number | null} */
    this._disconnectRetryMaxAttempts = null;
    this._disconnectRetryIntervalMs = 1000;
    /** @type {import('tls').ConnectionOptions | null} */
    this._tlsOptions = null;
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

  get tlsOptions() {
    return this._tlsOptions;
  }

  /**
   * @param {import('tls').ConnectionOptions | null} value
   */
  set tlsOptions(value) {
    this._tlsOptions = value;
  }

  get registry() {
    return this._registry;
  }

  /**
   * @param {import('appium-ios-remotexpc').TunnelRegistry | null} value
   */
  set registry(value) {
    this._registry = value;
  }

  /**
   * @param {number | null} maxAttempts - null disables retries; 0 means unlimited retries
   * @param {number} intervalMs
   */
  setDisconnectRetryPolicy(maxAttempts, intervalMs) {
    this._disconnectRetryMaxAttempts = maxAttempts;
    this._disconnectRetryIntervalMs = intervalMs;
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
    this._isCleaningUp = true;
    log.warn('Cleaning up tunnel resources...');
    while (this._registryWatcherStops.length > 0) {
      const stop = this._registryWatcherStops.pop();
      try {
        await stop?.();
      } catch (err) {
        log.warn(`Failed to stop tunnel registry watcher: ${err}`);
      }
    }

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
    await Promise.allSettled([...this._reconnectTasks.values()]);

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
    this._usbDevices.set(udid, device);

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
   * @param {string[]|undefined} specificUdids - Specific UDIDs to process, or undefined for all devices.
   * @param {import('tls').ConnectionOptions} tlsOptions - TLS options.
   * @returns {Promise<Array<import('appium-ios-remotexpc').TunnelResult>>} USB tunnel results (may be empty).
   */
  async setupUsbmuxTunnels(usbmux, specificUdids, tlsOptions) {
    log.info('Listing all connected devices...');
    const devices = this._dedupeUsbmuxDevicesByUdid(await usbmux.listDevices());

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
    const requestedUdids = specificUdids && specificUdids.length > 0 ? [...new Set(specificUdids)] : null;
    if (requestedUdids) {
      const requestedUdidSet = new Set(requestedUdids);
      devicesToProcess = devices.filter(
        (device) => requestedUdidSet.has(device.Properties.SerialNumber),
      );

      if (devicesToProcess.length === 0) {
        log.error(`None of the requested UDID(s) were found: ${requestedUdids.join(', ')}`);
        log.error('Available devices:');
        devices.forEach((device) => {
          log.error(`  - ${device.Properties.SerialNumber}`);
        });
        process.exit(1);
      }

      const foundUdidSet = new Set(devicesToProcess.map((device) => device.Properties.SerialNumber));
      const missingUdids = requestedUdids.filter((udid) => !foundUdidSet.has(udid));
      if (missingUdids.length > 0) {
        log.warn(`Some requested UDID(s) were not found and will be skipped: ${missingUdids.join(', ')}`);
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
   * Sets up tunnel(s) for paired Apple TV device(s) over WiFi.
   * If no specific device identifier is provided, a tunnel is created for each discovered device.
   * Does not start the registry server.
   * @param {string[]|undefined} [specificDeviceIds] - Optional Apple TV device identifiers to target.
   * @param {string[]|null} [prefetchedDeviceIds] - Optional prefetched Apple TV identifiers.
   * @returns {Promise<AppleTVRegistryEntry[]>} Apple TV registry entries.
   */
  async setupAppleTVTunnels(specificDeviceIds, prefetchedDeviceIds = null) {
    /** @type {AppleTVRegistryEntry[]} */
    const entries = [];

    try {
      log.info('Starting Apple TV tunnel (WiFi)...');
      if ((!specificDeviceIds || specificDeviceIds.length === 0) && prefetchedDeviceIds === null) {
        log.warn('Skipping Apple TV tunnel setup because discovery prefetch did not return device IDs.');
        return entries;
      }
      const discoveredDeviceIds = specificDeviceIds && specificDeviceIds.length > 0
        ? [...new Set(specificDeviceIds)]
        : /** @type {string[]} */ (prefetchedDeviceIds);
      const usbDiscoveredUdidSet = new Set(this._usbDevices.keys());
      const targetDeviceIds = discoveredDeviceIds.filter((udid) => !usbDiscoveredUdidSet.has(udid));
      if (targetDeviceIds.length < discoveredDeviceIds.length) {
        log.info(
          `Filtered out ${discoveredDeviceIds.length - targetDeviceIds.length} Apple TV candidate(s) already discovered via usbmux.`,
        );
      }

      if (_.isEmpty(targetDeviceIds)) {
        log.info('No paired Apple TV devices discovered after usbmux deduplication.');
        return entries;
      }

      for (const deviceId of targetDeviceIds) {
        /** @type {import('appium-ios-remotexpc').AppleTVTunnelService | null} */
        let tunnelService = null;
        /** @type {AppleTVTunnelConnection | null} */
        let tunnel = null;
        /** @type {import('appium-ios-remotexpc').PacketStreamServer | null} */
        let packetStreamServer = null;
        /** @type {import('node:tls').TLSSocket | null} */
        let tlsSocket = null;
        try {
          tunnelService = new AppleTVTunnelService();
          const result = await tunnelService.startTunnel(undefined, deviceId);
          tlsSocket = result.socket;
          const deviceInfo = result.device;

          if (!tlsSocket) {
            throw new Error('Apple TV TLS socket not established');
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
          this._appleTVDeviceIds.add(deviceInfo.identifier);

          entries.push({
            udid: deviceInfo.identifier,
            address: tunnel.Address,
            rsdPort: tunnel.RsdPort ?? 0,
            packetStreamPort,
          });
          log.info(`✅ Apple TV tunnel ready for ${deviceInfo.identifier}`);
        } catch (err) {
          log.warn(`Apple TV tunnel setup failed for ${deviceId}: ${err?.message ?? err}`);
          await teardownAppleTVTunnelResource(
            {tunnel, packetStreamServer, tunnelService, tlsSocket},
            `partially created (${deviceId})`,
          );
        }
      }
      return entries;
    } catch (err) {
      log.warn('Apple TV tunnel setup failed (ensure device is paired and on same network):', err?.message ?? err);
      return entries;
    }
  }

  /**
   * @param {import('appium-ios-remotexpc').TunnelResult} result
   */
  _upsertUsbTunnelInRegistry(result) {
    if (!this._registry || !result?.success) {
      return;
    }
    const udid = result.device.Properties.SerialNumber;
    const now = Date.now();
    this._registry.tunnels[udid] = {
      udid,
      deviceId: result.device.DeviceID,
      address: result.tunnel.Address,
      rsdPort: result.tunnel.RsdPort ?? 0,
      packetStreamPort: result.packetStreamPort,
      connectionType: result.device.Properties.ConnectionType,
      productId: result.device.Properties.ProductID,
      createdAt: this._registry.tunnels[udid]?.createdAt ?? now,
      lastUpdated: now,
    };
    this._refreshRegistryMetadata();
  }

  /**
   * @param {AppleTVRegistryEntry} entry
   */
  _upsertAppleTVTunnelInRegistry(entry) {
    if (!this._registry) {
      return;
    }
    const now = Date.now();
    this._registry.tunnels[entry.udid] = {
      udid: entry.udid,
      deviceId: 0,
      address: entry.address,
      rsdPort: entry.rsdPort,
      packetStreamPort: entry.packetStreamPort,
      connectionType: 'WiFi',
      productId: 0,
      createdAt: this._registry.tunnels[entry.udid]?.createdAt ?? now,
      lastUpdated: now,
    };
    this._refreshRegistryMetadata();
  }

  /**
   * @param {WatchTunnelRegistrySocketsFn} watchTunnelRegistrySockets
   * @param {Array<import('appium-ios-remotexpc').TunnelResult>} results
   * @param {{onTunnelDead?: (ctx: {udid: string; address: string}) => Promise<void>}} [callbacks]
   * @param {TunnelSocketWatch[]} [manualWatches]
   */
  _attachTunnelRegistryLifecycleWatch(
    watchTunnelRegistrySockets,
    results,
    callbacks = {},
    manualWatches = [],
  ) {
    if (!this._registry || !_.isFunction(watchTunnelRegistrySockets)) {
      return false;
    }
    this._watchTunnelRegistrySocketsFn = watchTunnelRegistrySockets;
    const watches = results
      .filter((r) => r.success && /** @type {any} */ (r).socket)
      .map((r) => {
        const watch = {
          udid: r.device.Properties.SerialNumber,
          socket: /** @type {any} */ (r).socket,
        };
        const {Address, RsdPort} = r.tunnel;
        if (Address && typeof RsdPort === 'number' && RsdPort > 0) {
          watch.rsdProbe = {host: Address, port: RsdPort};
        }
        return watch;
      });
    watches.push(...manualWatches);
    if (_.isEmpty(watches)) {
      return false;
    }
    const stopHandle = watchTunnelRegistrySockets({
      registry: this._registry,
      watches,
      onRemove: async (udid) => {
        await this._stopPacketStreamForUdid(udid);
        await this._teardownAppleTVByUdid(udid);
      },
      onTunnelDead: async ({udid, address}) => {
        if (_.isFunction(TunnelManager?.closeTunnelByAddress)) {
          await TunnelManager.closeTunnelByAddress(address).catch(() => {});
        }
        if (callbacks.onTunnelDead) {
          await callbacks.onTunnelDead({udid, address});
        }
      },
    });
    const stop = _.isFunction(stopHandle) ? stopHandle : stopHandle?.stop;
    if (stop) {
      this._registryWatcherStops.push(stop);
    }
    log.info('Attached tunnel registry lifecycle watcher');
    return true;
  }

  /**
   * @param {string} udid
   */
  _reconnectTunnelByUdid(udid) {
    if (this._isCleaningUp) {
      return;
    }
    const existingTask = this._reconnectTasks.get(udid);
    if (existingTask) {
      return;
    }
    const task = (async () => {
      try {
        if (!this._isRetryEnabledForUdid(udid)) {
          return;
        }
        if (!this._tlsOptions) {
          log.warn(`Cannot retry tunnel for ${udid}: TLS options are unavailable`);
          return;
        }
        const maxAttempts = this._disconnectRetryMaxAttempts;
        if (maxAttempts === null) {
          return;
        }
        const watchFn = this._watchTunnelRegistrySocketsFn;
        if (!watchFn) {
          log.warn(`Cannot retry tunnel for ${udid}: watcher function is unavailable`);
          return;
        }
        const device = this._usbDevices.get(udid);
        const isAppleTV = this._appleTVDeviceIds.has(udid);
        if (!device && !isAppleTV) {
          return;
        }

        let attempt = 0;
        while (!this._isCleaningUp) {
          if (maxAttempts !== 0 && attempt >= maxAttempts) {
            log.warn(`Retry limit reached for ${udid}; keeping it removed from the registry`);
            return;
          }
          attempt += 1;
          log.warn(
            `Retrying tunnel creation for ${udid} (attempt ${attempt}${maxAttempts === 0 ? ', unlimited' : `/${maxAttempts}`}) in ${this._disconnectRetryIntervalMs}ms...`,
          );
          await this._sleep(this._disconnectRetryIntervalMs);

          try {
            if (device) {
              const result = await this.createTunnelForDevice(device, this._tlsOptions);
              this._upsertUsbTunnelInRegistry(result);
              this._attachTunnelRegistryLifecycleWatch(watchFn, [result], {
                onTunnelDead: async ({udid: droppedUdid}) => {
                  this._reconnectTunnelByUdid(droppedUdid);
                },
              });
              log.info(`Successfully recreated tunnel for ${udid}`);
              return;
            }

            const appletvResult = await this._createAppleTVTunnelForUdid(udid);
            this._upsertAppleTVTunnelInRegistry(appletvResult.entry);
            this._attachTunnelRegistryLifecycleWatch(
              watchFn,
              [],
              {
                onTunnelDead: async ({udid: droppedUdid}) => {
                  this._reconnectTunnelByUdid(droppedUdid);
                },
              },
              [appletvResult.watch],
            );
            log.info(`Successfully recreated Apple TV tunnel for ${udid}`);
            return;
          } catch (retryErr) {
            log.warn(`Failed to recreate tunnel for ${udid}: ${retryErr?.message ?? retryErr}`);
          }
        }
      } catch (taskErr) {
        log.warn(`Tunnel loss handling failed for ${udid}: ${taskErr?.message ?? taskErr}`);
      } finally {
        this._reconnectTasks.delete(udid);
      }
    })();
    this._reconnectTasks.set(udid, task);
  }

  /**
   * @param {string} udid
   * @returns {Promise<AppleTVReconnectResult>}
   */
  async _createAppleTVTunnelForUdid(udid) {
    const tunnelService = new AppleTVTunnelService();
    const result = await tunnelService.startTunnel(undefined, udid);
    if (!result.socket) {
      throw new Error('Apple TV TLS socket not established');
    }
    const tunnel = await TunnelManager.getTunnel(result.socket);

    const packetStreamPort = this._packetStreamBasePort++;
    const packetStreamServer = new PacketStreamServer(packetStreamPort);
    await packetStreamServer.start();
    const consumer = packetStreamServer.getPacketConsumer();
    if (consumer && tunnel?.addPacketConsumer) {
      tunnel.addPacketConsumer(consumer);
    }

    this._appletvResources.push({
      tunnel,
      packetStreamServer,
      tunnelService,
      udid,
      tlsSocket: result.socket,
    });
    this._appleTVDeviceIds.add(udid);

    /** @type {TunnelSocketWatch} */
    const watch = {
      udid,
      socket: result.socket,
    };
    if (tunnel?.Address && typeof tunnel?.RsdPort === 'number' && tunnel.RsdPort > 0) {
      watch.rsdProbe = {host: tunnel.Address, port: tunnel.RsdPort};
    }

    return {
      entry: {
        udid,
        address: tunnel.Address,
        rsdPort: tunnel.RsdPort ?? 0,
        packetStreamPort,
      },
      watch,
    };
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  async _sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * @param {string} udid
   * @returns {Promise<void>}
   */
  async _stopPacketStreamForUdid(udid) {
    const server = this._packetStreamServers.get(udid);
    if (!server) {
      return;
    }
    try {
      await server.stop();
      log.info(`Stopped packet stream server after tunnel loss for ${udid}`);
    } catch (err) {
      log.warn(`Failed to stop packet stream server for ${udid}: ${err}`);
    }
    this._packetStreamServers.delete(udid);
  }

  /**
   * @param {string} udid
   * @returns {Promise<void>}
   */
  async _teardownAppleTVByUdid(udid) {
    const idx = this._appletvResources.findIndex((x) => x.udid === udid);
    if (idx < 0) {
      return;
    }
    const [resource] = this._appletvResources.splice(idx, 1);
    await teardownAppleTVTunnelResource(resource, udid);
    log.info(`Tore down Apple TV tunnel resources for ${udid}`);
  }


  /**
   * @param {string} udid
   * @returns {boolean}
   */
  _isRetryEnabledForUdid(udid) {
    return (
      (this._usbDevices.has(udid) || this._appleTVDeviceIds.has(udid))
      && this._disconnectRetryMaxAttempts !== null
    );
  }

  /**
   * Deduplicates usbmux responses by UDID (serial number).
   * If both wired and wireless entries exist, wired is preferred.
   *
   * @param {import('appium-ios-remotexpc').UsbmuxDevice[]} devices
   * @returns {import('appium-ios-remotexpc').UsbmuxDevice[]}
   */
  _dedupeUsbmuxDevicesByUdid(devices) {
    /** @type {Map<string, import('appium-ios-remotexpc').UsbmuxDevice>} */
    const byUdid = new Map();
    for (const device of devices) {
      const udid = device?.Properties?.SerialNumber;
      if (!udid) {
        continue;
      }
      const existing = byUdid.get(udid);
      if (!existing) {
        byUdid.set(udid, device);
        continue;
      }
      const existingConn = `${existing?.Properties?.ConnectionType ?? ''}`.toLowerCase();
      const nextConn = `${device?.Properties?.ConnectionType ?? ''}`.toLowerCase();
      const existingIsWired = existingConn === 'usb' || existingConn === 'wired';
      const nextIsWired = nextConn === 'usb' || nextConn === 'wired';
      if (!existingIsWired && nextIsWired) {
        byUdid.set(udid, device);
      }
    }
    if (byUdid.size !== devices.length) {
      log.info(`Deduplicated USB device list by UDID: ${devices.length} -> ${byUdid.size}`);
    }
    return [...byUdid.values()];
  }

  _refreshRegistryMetadata() {
    if (!this._registry) {
      return;
    }
    const total = Object.keys(this._registry.tunnels).length;
    this._registry.metadata = {
      lastUpdated: new Date().toISOString(),
      totalTunnels: total,
      activeTunnels: total,
    };
  }

  /**
   * @param {string[] | undefined} specificDeviceIds
   * @returns {Promise<string[] | null>}
   */
  async _prefetchAppleTVDeviceIds(specificDeviceIds) {
    if (specificDeviceIds && specificDeviceIds.length > 0) {
      return [...new Set(specificDeviceIds)];
    }
    const tunnelService = new AppleTVTunnelService();
    try {
      log.info('Prefetching paired Apple TV devices in parallel...');
      const devices = await tunnelService.discoverDevices();
      return devices.map((d) => d.identifier);
    } catch (err) {
      log.warn(`Apple TV discovery prefetch failed: ${err?.message ?? err}`);
      return null;
    } finally {
      try {
        tunnelService.disconnect();
      } catch {}
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
    .option(
      '--udid <udid>',
      'UDID of the device to create tunnel for (repeatable)',
      collectStringValues,
      [],
    )
    .option(
      '--packet-stream-base-port <port>',
      'Base port for packet stream servers (1-65535)',
      (value) => parsePortOption(value, 'packet stream base port'),
    )
    .option(
      '--tunnel-registry-port <port>',
      'Port for the tunnel registry API server (1-65535)',
      (value) => parsePortOption(value, 'tunnel registry port'),
    )
    .option(
      '--appletv-device-id <identifier>',
      'Apple TV device identifier to tunnel (repeatable, from pair-appletv)',
      collectStringValues,
      [],
    )
    .option(
      '--disconnect-retry-max-attempts <count>',
      'Max tunnel recreation attempts after unexpected disconnect: 0 = unlimited; omit to disable retries',
      (value) => parseNonNegativeIntegerOption(value, 'disconnect retry max attempts'),
    )
    .option(
      '--disconnect-retry-interval-ms <ms>',
      'Delay between tunnel recreation attempts in milliseconds (default 1000)',
      (value) => parsePositiveIntegerOption(value, 'disconnect retry interval'),
      1000,
    );

  program.parse(process.argv);
  const options = program.opts();
  const requestedAppleTVIds = _.uniq([...(options.appletvDeviceId ?? [])]);

  const tunnelCreator = new TunnelCreator();
  const cleanupOnce = setupCleanupHandlers(tunnelCreator);

  try {
    if (options.packetStreamBasePort !== undefined) {
      tunnelCreator.packetStreamBasePort = options.packetStreamBasePort;
    }
    const isTunnelRegistryPortSet = options.tunnelRegistryPort !== undefined;
    if (isTunnelRegistryPortSet) {
      tunnelCreator.tunnelRegistryPort = options.tunnelRegistryPort;
    }

    const box = strongbox(TUNNEL_CONTAINER_NAME);
    const item = new BaseItem(TUNNEL_REGISTRY_PORT, box);
    try {
      const value = await item.read();
      if (!value || isTunnelRegistryPortSet) {
        await item.write(String(tunnelCreator.tunnelRegistryPort));
      } else {
        const persistedPort = Number.parseInt(String(value), 10);
        if (persistedPort > 0 && persistedPort < 65536) {
          tunnelCreator.tunnelRegistryPort = persistedPort;
        }
      }
    } catch (error) {
      throw new Error(`Tunnel registry port cannot be persisted: ${error.message}`);
    }

    /** @type {import('tls').ConnectionOptions} */
    const tlsOptions = {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    };
    tunnelCreator.tlsOptions = tlsOptions;
    tunnelCreator.setDisconnectRetryPolicy(
      options.disconnectRetryMaxAttempts ?? null,
      options.disconnectRetryIntervalMs,
    );
    const prefetchedAppleTVDeviceIdsPromise = tunnelCreator._prefetchAppleTVDeviceIds(
      requestedAppleTVIds,
    );

    log.info('Connecting to usbmuxd...');
    const usbmux = await createUsbmux();
    /** @type {import('appium-ios-remotexpc').TunnelResult[]} */
    let usbResults = [];
    try {
      usbResults = await tunnelCreator.setupUsbmuxTunnels(usbmux, options.udid, tlsOptions);
    } finally {
      await usbmux.close();
    }

    // Automatically add paired Apple TV(s) over WiFi when available
    const prefetchedAppleTVDeviceIds = await prefetchedAppleTVDeviceIdsPromise;
    /** @type {AppleTVRegistryEntry[]} */
    const appletvEntries = await tunnelCreator.setupAppleTVTunnels(
      requestedAppleTVIds,
      prefetchedAppleTVDeviceIds,
    );

    const registry = await tunnelCreator.updateTunnelRegistry(usbResults, appletvEntries);
    tunnelCreator.registry = registry;
    const totalTunnels = Object.keys(registry.tunnels).length;

    if (totalTunnels === 0) {
      log.warn('No tunnels created (no USB devices and no Apple TV tunnel).');
      return;
    }

    await startTunnelRegistryServer(registry, tunnelCreator.tunnelRegistryPort);
    tunnelCreator._attachTunnelRegistryLifecycleWatch(watchTunnelRegistrySockets, usbResults, {
      onTunnelDead: async ({udid}) => {
        tunnelCreator._reconnectTunnelByUdid(udid);
      },
    }, tunnelCreator._appletvResources.map((resource) => {
      /** @type {TunnelSocketWatch} */
      const watch = {
        udid: resource.udid,
        socket: resource.tlsSocket,
      };
      if (
        resource.tunnel?.Address
        && typeof resource.tunnel?.RsdPort === 'number'
        && resource.tunnel.RsdPort > 0
      ) {
        watch.rsdProbe = {
          host: resource.tunnel.Address,
          port: resource.tunnel.RsdPort,
        };
      }
      return watch;
    }));

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
  } catch (err) {
    log.error('Error during tunnel setup:', err);
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

/**
 * @typedef {Object} TunnelSocketWatch
 * Watch descriptor consumed by watchTunnelRegistrySockets.
 * @property {string} udid
 * @property {any} socket
 * @property {{host: string; port: number}} [rsdProbe]
 */

/**
 * @typedef {(options: Record<string, any>) => any} WatchTunnelRegistrySocketsFn
 */

/**
 * @typedef {Object} AppleTVReconnectResult
 * @property {AppleTVRegistryEntry} entry
 * @property {TunnelSocketWatch} watch
 */
