#!/usr/bin/env node
/**
 * Test script for creating lockdown service, starting CoreDeviceProxy, and creating tunnel
 * This script demonstrates the tunnel creation workflow for all connected devices.
 *
 * Must be run as root (e.g. sudo appium driver run xcuitest tunnel-creation).
 */
import {logger} from 'appium/support.js';

import {
  AppleTVTunnelService,
  TunnelManager,
  TunnelReadinessCoordinator,
  createLockdownServiceByUDID,
  createUsbmux,
  discoverServices,
  servicesToCatalog,
  startCoreDeviceProxyTcp,
  startTunnelRegistryServer,
  TUNNEL_CONTAINER_NAME,
  watchTunnelRegistryOnDead,
} from 'appium-ios-remotexpc';

import {strongbox, BaseItem} from '@appium/strongbox';
import {Command} from 'commander';

const log = logger.getLogger('TunnelCreation');
const TUNNEL_REGISTRY_PORT = 'tunnelRegistryPort';
const DEFAULT_TUNNEL_REGISTRY_PORT = 42314;

/**
 * TunnelCreator class for managing tunnel creation and related operations (USB and optional Apple TV over WiFi).
 */
class TunnelCreator {
  constructor() {
    this._tunnelRegistryPort = DEFAULT_TUNNEL_REGISTRY_PORT;
    /** @type {import('appium-ios-remotexpc').TunnelRegistryServer | null} */
    this._registryServer = null;
    /** @type {import('appium-ios-remotexpc').TunnelReadinessCoordinator} */
    this._readiness = new TunnelReadinessCoordinator();
    /** @type {Map<string, import('appium-ios-remotexpc').UsbmuxDevice>} */
    this._usbDevicesByUdid = new Map();
    /** @type {Set<string>} */
    this._appleTVDeviceIds = new Set();
    /** @type {Map<string, EstablishedTunnel>} */
    this._establishedTunnelsByUdid = new Map();
    /** @type {Map<string, () => void>} */
    this._lifecycleWatchStopByUdid = new Map();
    /** @type {Array<() => void>} */
    this._registryWatcherStops = [];
    /** @type {Map<string, Promise<void>>} */
    this._reconnectTasks = new Map();
    /** @type {Map<string, import('appium-ios-remotexpc').AppleTVTunnelService>} */
    this._appletvTunnelServicesByUdid = new Map();
    this._isCleaningUp = false;
    /** @type {number | null} */
    this._disconnectRetryMaxAttempts = null;
    this._disconnectRetryIntervalMs = 1000;
  }

  get tunnelRegistryPort() {
    return this._tunnelRegistryPort;
  }

  get registryServer() {
    return this._registryServer;
  }

  set tunnelRegistryPort(port) {
    this._tunnelRegistryPort = port;
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
   * @returns {Promise<void>}
   */
  async startRegistryServer() {
    const registry = {
      tunnels: {},
      metadata: {
        lastUpdated: new Date().toISOString(),
        totalTunnels: 0,
        activeTunnels: 0,
      },
    };
    this._registryServer = await startTunnelRegistryServer(
      registry,
      this._tunnelRegistryPort,
      {
        readiness: this._readiness,
        refreshServices: async (udid, entry) => this._refreshServiceCatalog(udid, entry),
      },
    );
  }

  /**
   * @param {string} udid
   * @param {import('appium-ios-remotexpc').TunnelRegistryEntry} entry
   */
  async _refreshServiceCatalog(udid, entry) {
    log.info(`Refreshing RSD service catalog for ${udid}...`);
    const services = await discoverServices(udid, entry.address, entry.rsdPort);
    const now = Date.now();
    return {
      ...entry,
      services: servicesToCatalog(services),
      catalogUpdatedAt: now,
      lastUpdated: now,
    };
  }

  /**
   * Cleanup resources for graceful shutdown
   */
  async cleanup() {
    this._isCleaningUp = true;
    log.warn('Cleaning up tunnel resources...');
    /** @type {Error[]} */
    const cleanupErrors = [];
    const recordCleanupError = (message, err) => {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      cleanupErrors.push(new Error(message, {cause: wrapped}));
      log.warn(`${message}: ${wrapped.message}`);
    };

    while (this._registryWatcherStops.length > 0) {
      const stop = this._registryWatcherStops.pop();
      try {
        stop?.();
      } catch (err) {
        recordCleanupError('Failed to stop tunnel registry watcher', err);
      }
    }
    this._lifecycleWatchStopByUdid.clear();

    if (this._registryServer) {
      try {
        await this._registryServer.stop();
      } catch (err) {
        recordCleanupError('Failed to stop tunnel registry server', err);
      } finally {
        this._registryServer = null;
      }
    }

    for (const [udid, established] of this._establishedTunnelsByUdid.entries()) {
      try {
        if (established.tunnelConnection && typeof established.tunnelConnection.closer === 'function') {
          await established.tunnelConnection.closer();
        }
      } catch (err) {
        recordCleanupError(`Failed to close tunnel for ${udid}`, err);
      }
    }
    this._establishedTunnelsByUdid.clear();

    for (const [udid, tunnelService] of this._appletvTunnelServicesByUdid.entries()) {
      try {
        tunnelService.disconnect();
      } catch (err) {
        recordCleanupError(`Failed to disconnect Apple TV tunnel service for ${udid}`, err);
      }
    }
    this._appletvTunnelServicesByUdid.clear();

    try {
      await TunnelManager.closeAllTunnels();
    } catch (err) {
      recordCleanupError('Failed to close managed tunnel(s)', err);
    }
    await Promise.allSettled([...this._reconnectTasks.values()]);

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Tunnel cleanup encountered errors');
    }
    log.info('Cleanup completed.');
  }

  /**
   * @param {string} udid
   * @param {EstablishedTunnel} result
   */
  _registerEstablishedTunnel(udid, result) {
    this._stopLifecycleWatch(udid);
    const previous = this._establishedTunnelsByUdid.get(udid);
    if (
      previous?.tunnelConnection &&
      previous.tunnelConnection !== result.tunnelConnection
    ) {
      void closeTunnelQuietly(previous.tunnelConnection);
    }
    this._establishedTunnelsByUdid.set(udid, result);
  }

  /**
   * @param {string} udid
   */
  _stopLifecycleWatch(udid) {
    const stop = this._lifecycleWatchStopByUdid.get(udid);
    if (stop) {
      stop();
      this._lifecycleWatchStopByUdid.delete(udid);
    }
  }

  /**
   * Create tunnel for a single USB device
   * @param {import('appium-ios-remotexpc').UsbmuxDevice} device - Device object
   * @returns {Promise<UsbTunnelResult>} Tunnel result
   */
  async createUsbTunnelForDevice(device) {
    const udid = device.Properties.SerialNumber;
    this._usbDevicesByUdid.set(udid, device);

    log.info(`\n--- Processing device: ${udid} ---`);
    log.info(`Device ID: ${device.DeviceID}`);
    log.info(`Connection Type: ${device.Properties.ConnectionType}`);
    log.info(`Product ID: ${device.Properties.ProductID}`);

    log.info('Creating lockdown service...');
    const {lockdownService, device: lockdownDevice} = await createLockdownServiceByUDID(udid);
    log.info(`Lockdown service created for device: ${lockdownDevice.Properties.SerialNumber}`);

    log.info('Starting CoreDeviceProxy (raw TCP, native OpenSSL forwarder)...');
    const {socket, cert, key} = await startCoreDeviceProxyTcp(
      lockdownService,
      lockdownDevice.DeviceID,
      lockdownDevice.Properties.SerialNumber,
    );
    log.info('CoreDeviceProxy started successfully');

    log.info('Creating tunnel...');
    /** @type {{ notify: ((reason: string) => void) | null }} */
    const lifecycle = {notify: null};
    const tunnelConnection = await TunnelManager.getTunnel(
      socket,
      {cert, key},
      {
        onDead: (reason) => lifecycle.notify?.(reason),
      },
    );
    log.info(
      `Tunnel created for address: ${tunnelConnection.Address} with RsdPort: ${tunnelConnection.RsdPort}`,
    );

    log.info(`✅ Tunnel creation completed successfully for device: ${udid}`);
    log.info(`   Tunnel Address: ${tunnelConnection.Address}`);
    log.info(`   Tunnel RsdPort: ${tunnelConnection.RsdPort}`);

    /** @type {UsbTunnelSuccess} */
    const result = {
      kind: 'usb',
      device,
      tunnel: {
        Address: tunnelConnection.Address,
        RsdPort: tunnelConnection.RsdPort,
      },
      success: true,
      tunnelConnection,
      registerOnDead: (handler) => {
        lifecycle.notify = handler;
      },
    };

    this._registerEstablishedTunnel(udid, result);
    return result;
  }

  /**
   * Sets up tunnels for all connected USB devices.
   * @param {import('appium-ios-remotexpc').Usbmux} usbmux - The usbmux object.
   * @param {string[]|undefined} specificUdids - Specific UDIDs to process, or undefined for all devices.
   * @returns {Promise<UsbTunnelResult[]>} USB tunnel results (may be empty).
   */
  async setupUsbmuxTunnels(usbmux, specificUdids) {
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

    /** @type {UsbTunnelResult[]} */
    const results = [];

    for (const device of devicesToProcess) {
      try {
        const result = await this.createUsbTunnelForDevice(device);
        results.push(result);
      } catch (err) {
        const errorMessage = `Failed to create tunnel for device ${device.Properties.SerialNumber}: ${err}`;
        log.error(`❌ ${errorMessage}`);
        results.push({
          kind: 'usb',
          device,
          tunnel: {Address: '', RsdPort: 0},
          success: false,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * Sets up tunnel(s) for paired Apple TV device(s) over WiFi.
   * @param {string[]|undefined} [specificDeviceIds] - Optional Apple TV device identifiers to target.
   * @param {string[]|null} [prefetchedDeviceIds] - Optional prefetched Apple TV identifiers.
   * @returns {Promise<AppleTVTunnelResult[]>} Apple TV tunnel results.
   */
  async setupAppleTVTunnels(specificDeviceIds, prefetchedDeviceIds = null) {
    /** @type {AppleTVTunnelResult[]} */
    const results = [];

    try {
      if ((!specificDeviceIds || specificDeviceIds.length === 0) && prefetchedDeviceIds === null) {
        log.warn('Skipping Apple TV tunnel setup because discovery prefetch did not return device IDs.');
        return results;
      }
      const discoveredDeviceIds = specificDeviceIds && specificDeviceIds.length > 0
        ? [...new Set(specificDeviceIds)]
        : /** @type {string[]} */ (prefetchedDeviceIds);
      log.info('Starting Apple TV tunnel (WiFi)...');
      const usbDiscoveredUdidSet = new Set(this._usbDevicesByUdid.keys());
      const targetDeviceIds = discoveredDeviceIds.filter((udid) => !usbDiscoveredUdidSet.has(udid));
      if (targetDeviceIds.length < discoveredDeviceIds.length) {
        log.info(
          `Filtered out ${discoveredDeviceIds.length - targetDeviceIds.length} Apple TV candidate(s) already discovered via usbmux.`,
        );
      }

      if (!targetDeviceIds?.length) {
        log.info('No paired Apple TV devices discovered after usbmux deduplication.');
        return results;
      }

      for (const deviceId of targetDeviceIds) {
        try {
          const result = await this._createAppleTVTunnelForUdid(deviceId);
          results.push(result);
          log.info(`✅ Apple TV tunnel ready for ${deviceId}`);
        } catch (err) {
          log.warn(`Apple TV tunnel setup failed for ${deviceId}: ${err?.message ?? err}`);
          results.push({
            kind: 'appletv',
            device: {identifier: deviceId},
            tunnel: {Address: '', RsdPort: 0},
            success: false,
            error: String(err?.message ?? err),
          });
        }
      }
      return results;
    } catch (err) {
      log.warn('Apple TV tunnel setup failed (ensure device is paired and on same network):', err?.message ?? err);
      return results;
    }
  }

  /**
   * @param {string[] | undefined} specificDeviceIds
   * @returns {Promise<string[] | null>}
   */
  async prefetchAppleTVDeviceIds(specificDeviceIds) {
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

  /**
   * @param {string} udid
   * @returns {Promise<AppleTVTunnelResult>}
   */
  async _createAppleTVTunnelForUdid(udid) {
    let tunnelService = this._appletvTunnelServicesByUdid.get(udid);
    if (!tunnelService) {
      tunnelService = new AppleTVTunnelService();
      this._appletvTunnelServicesByUdid.set(udid, tunnelService);
    }

    const startResult = await tunnelService.startTunnel(undefined, udid);
    if (!startResult.tcpSocket) {
      throw new Error('Apple TV TCP socket to listener port not established');
    }

    log.info(`Creating tunnel for Apple TV: ${startResult.device.identifier}`);
    /** @type {{ notify: ((reason: string) => void) | null }} */
    const lifecycle = {notify: null};
    const tunnelConnection = await TunnelManager.getTunnelPsk(
      startResult.tcpSocket,
      {psk: startResult.psk},
      {
        onDead: (reason) => lifecycle.notify?.(reason),
      },
    );

    this._appleTVDeviceIds.add(udid);

    /** @type {AppleTVTunnelSuccess} */
    const result = {
      kind: 'appletv',
      device: startResult.device,
      tunnel: {
        Address: tunnelConnection.Address,
        RsdPort: tunnelConnection.RsdPort,
      },
      success: true,
      tunnelConnection,
      registerOnDead: (handler) => {
        lifecycle.notify = handler;
      },
      tunnelService,
    };

    this._registerEstablishedTunnel(udid, result);
    return result;
  }

  /**
   * @param {EstablishedTunnel} result
   * @returns {Promise<boolean>}
   */
  async publishDiscoveredTunnelEntry(result) {
    if (!this._registryServer) {
      throw new Error('Registry server is not started');
    }

    const udid = getTunnelUdid(result);
    const rsdPort = result.tunnel.RsdPort;
    if (typeof rsdPort !== 'number' || rsdPort <= 0) {
      log.warn(`Skipping registry entry for ${udid}: no valid RSD port (got ${String(rsdPort)})`);
      return false;
    }

    this._registryServer.markTunnelPending(udid);
    log.info(`Discovering RSD services for ${udid} at ${result.tunnel.Address}:${rsdPort}...`);

    const services = await discoverServices(udid, result.tunnel.Address, rsdPort);
    const now = Date.now();
    const registry = this._registryServer.getRegistry();
    const existing = registry.tunnels[udid];
    const entry = buildTunnelRegistryEntry(result, existing, now);
    entry.services = servicesToCatalog(services);
    entry.catalogUpdatedAt = now;

    this._registryServer.upsertReadyEntry(udid, entry);
    log.info(
      `Published tunnel catalog for ${udid} (${Object.keys(entry.services).length} services)`,
    );
    return true;
  }

  /**
   * @param {EstablishedTunnel} result
   * @param {(ctx: {udid: string; address: string}) => Promise<void>} [onTunnelDead]
   */
  attachTunnelRegistryLifecycleWatch(result, onTunnelDead) {
    if (!this._registryServer) {
      return false;
    }
    const udid = getTunnelUdid(result);
    this._stopLifecycleWatch(udid);

    const {stop} = watchTunnelRegistryOnDead({
      registry: this._registryServer.getRegistry(),
      watches: [
        {
          udid,
          registerOnDead: result.registerOnDead,
        },
      ],
      onRemove: async (removedUdid) => {
        this._registryServer?.removeTunnelEntry(removedUdid);
      },
      onTunnelDead: async ({udid: droppedUdid, address}) => {
        if (typeof TunnelManager?.closeTunnelByAddress === 'function') {
          await TunnelManager.closeTunnelByAddress(address).catch(() => {});
        }
        if (onTunnelDead) {
          await onTunnelDead({udid: droppedUdid, address});
        }
      },
    });
    this._registryWatcherStops.push(stop);
    this._lifecycleWatchStopByUdid.set(udid, stop);
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
        const maxAttempts = this._disconnectRetryMaxAttempts;
        if (maxAttempts === null) {
          return;
        }

        const device = this._usbDevicesByUdid.get(udid);
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
          await sleep(this._disconnectRetryIntervalMs);

          try {
            this._registryServer?.markTunnelPending(udid);
            const result = device
              ? await this.createUsbTunnelForDevice(device)
              : await this._createAppleTVTunnelForUdid(udid);

            this.attachTunnelRegistryLifecycleWatch(result, async ({udid: droppedUdid}) => {
              this._reconnectTunnelByUdid(droppedUdid);
            });
            const published = await this.publishDiscoveredTunnelEntry(result);
            if (published) {
              log.info(`Successfully recreated tunnel for ${udid}`);
              return;
            }
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
   * @returns {boolean}
   */
  _isRetryEnabledForUdid(udid) {
    return (
      (this._usbDevicesByUdid.has(udid) || this._appleTVDeviceIds.has(udid))
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
}

/**
 * @param {import('appium-ios-tuntap').TunnelConnection} tunnelConnection
 */
async function closeTunnelQuietly(tunnelConnection) {
  try {
    await tunnelConnection.closer();
  } catch {
    // superseded tunnel may already be stopped
  }
}

/**
 * @param {EstablishedTunnel} result
 * @param {import('appium-ios-remotexpc').TunnelRegistryEntry | undefined} existing
 * @param {number} now
 */
function buildTunnelRegistryEntry(result, existing, now) {
  if (result.kind === 'usb') {
    const device = /** @type {import('appium-ios-remotexpc').UsbmuxDevice} */ (result.device);
    return {
      udid: device.Properties.SerialNumber,
      deviceId: device.DeviceID,
      address: result.tunnel.Address,
      rsdPort: result.tunnel.RsdPort ?? 0,
      services: {},
      connectionType: device.Properties.ConnectionType,
      productId: device.Properties.ProductID,
      createdAt: existing?.createdAt ?? now,
      lastUpdated: now,
    };
  }
  const device = /** @type {{ identifier: string, name?: string }} */ (result.device);
  return {
    udid: device.identifier,
    deviceId: 0,
    address: result.tunnel.Address,
    rsdPort: result.tunnel.RsdPort ?? 0,
    services: {},
    connectionType: 'WiFi',
    productId: 0,
    createdAt: existing?.createdAt ?? now,
    lastUpdated: now,
  };
}

/**
 * @param {EstablishedTunnel} result
 * @returns {string}
 */
function getTunnelUdid(result) {
  if (result.kind === 'usb') {
    return /** @type {import('appium-ios-remotexpc').UsbmuxDevice} */ (result.device).Properties.SerialNumber;
  }
  return /** @type {{ identifier: string }} */ (result.device).identifier;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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
      if (!process.exitCode) {
        process.exitCode = 1;
      }
    }
  };

  const shutdownSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of shutdownSignals) {
    process.on(signal, () => {
      if (process.exitCode == null) {
        if (signal === 'SIGINT') {
          process.exitCode = 0;
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

function assertRoot() {
  if (typeof process.getuid !== 'function') {
    return;
  }
  if (process.getuid() !== 0) {
    throw new Error(
      'This script must be run as root (e.g. sudo appium driver run xcuitest tunnel-creation ...).',
    );
  }
}

async function main() {
  assertRoot();
  const program = new Command();
  program
    .name('appium driver run xcuitest tunnel-creation')
    .description('Create tunnels for connected iOS devices')
    .option(
      '--udid <udid>',
      'UDID of the device to create tunnel for (repeatable). ' +
      'If omitted, tunnels are created for all connected devices.',
      collectStringValues,
      [],
    )
    .option(
      '--tunnel-registry-port <port>',
      'Port for the tunnel registry API server (1-65535)',
      (value) => parsePortOption(value, 'tunnel registry port'),
    )
    .option(
      '--appletv-device-id <identifier>',
      'Apple TV device identifier to tunnel (repeatable, from pair-appletv; ' +
      'omit to tunnel all discovered paired Apple TVs)',
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
  const requestedUdids = [...new Set([...(options.udid ?? [])])];
  const requestedAppleTVIds = [...new Set([...(options.appletvDeviceId ?? [])])];
  const hasRequestedUdids = requestedUdids.length > 0;
  const hasRequestedAppleTVIds = requestedAppleTVIds.length > 0;
  const shouldRunUsbFlow = !hasRequestedAppleTVIds || hasRequestedUdids;
  const shouldRunAppleTVFlow = !hasRequestedUdids || hasRequestedAppleTVIds;

  const tunnelCreator = new TunnelCreator();
  const cleanupOnce = setupCleanupHandlers(tunnelCreator);

  try {
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
      throw new Error(`Tunnel registry port cannot be persisted: ${error.message}`, {cause: error});
    }

    tunnelCreator.setDisconnectRetryPolicy(
      options.disconnectRetryMaxAttempts ?? null,
      options.disconnectRetryIntervalMs,
    );

    await tunnelCreator.startRegistryServer();

    const prefetchedAppleTVDeviceIdsPromise = shouldRunAppleTVFlow
      ? tunnelCreator.prefetchAppleTVDeviceIds(requestedAppleTVIds)
      : Promise.resolve(null);

    const usbmux = await createUsbmux();
    /** @type {UsbTunnelResult[]} */
    let usbResults = [];
    try {
      if (shouldRunUsbFlow) {
        log.info('Connecting to usbmuxd...');
        usbResults = await tunnelCreator.setupUsbmuxTunnels(usbmux, requestedUdids);
      } else {
        log.info('Skipping USB tunnel setup because only --appletv-device-id was provided.');
      }
    } finally {
      await usbmux.close();
    }

    /** @type {AppleTVTunnelResult[]} */
    let appletvResults = [];
    if (shouldRunAppleTVFlow) {
      const prefetchedAppleTVDeviceIds = await prefetchedAppleTVDeviceIdsPromise;
      appletvResults = await tunnelCreator.setupAppleTVTunnels(
        requestedAppleTVIds,
        prefetchedAppleTVDeviceIds,
      );
    } else {
      log.info('Skipping Apple TV tunnel setup because only --udid was provided.');
    }

    const successfulResults = [
      ...usbResults.filter((r) => r.success),
      ...appletvResults.filter((r) => r.success),
    ];

    if (successfulResults.length === 0) {
      log.warn('No tunnels created (no USB devices and no Apple TV tunnel).');
      return;
    }

    const publishedResults = [];
    for (const result of successfulResults) {
      tunnelCreator.attachTunnelRegistryLifecycleWatch(result, async ({udid}) => {
        tunnelCreator._reconnectTunnelByUdid(udid);
      });
      const published = await tunnelCreator.publishDiscoveredTunnelEntry(result);
      if (published) {
        publishedResults.push(result);
      }
    }

    const successfulUsb = usbResults.filter((r) => r.success);
    const successfulAppleTV = appletvResults.filter((r) => r.success);
    log.info('\n=== TUNNEL CREATION SUMMARY ===');
    log.info(`USB tunnels: ${successfulUsb.length}`);
    log.info(`Apple TV (WiFi) tunnels: ${successfulAppleTV.length}`);
    log.info(`Published tunnels: ${publishedResults.length}`);

    log.info('\n📁 Tunnel registry API:');
    log.info('   The tunnel registry is now available through the API at:');
    log.info(`   http://localhost:${tunnelCreator.tunnelRegistryPort}/remotexpc/tunnels`);
    log.info('\n   Available endpoints:');
    log.info('   - GET /remotexpc/tunnels - List all tunnels');
    log.info('   - GET /remotexpc/tunnels/:udid?waitMs=15000 - Get tunnel (long-poll until catalog ready)');
    log.info('   - POST /remotexpc/tunnels/:udid/refresh-services - Re-discover RSD catalog');
    log.info('   - GET /remotexpc/tunnels/metadata - Get registry metadata');
    const firstUdid = publishedResults.length > 0
      ? getTunnelUdid(publishedResults[0])
      : undefined;
    if (firstUdid) {
      log.info(`   curl "http://localhost:${tunnelCreator.tunnelRegistryPort}/remotexpc/tunnels/${firstUdid}?waitMs=15000"`);
    }
  } catch (err) {
    log.error('Error during tunnel setup:', err);
    await cleanupOnce();
  }
}

await main();

/**
 * @typedef {Object} EstablishedTunnel
 * @property {'usb' | 'appletv'} kind
 * @property {{ Properties: { SerialNumber: string }, DeviceID: number } | { identifier: string, name?: string }} device
 * @property {{ Address: string, RsdPort?: number }} tunnel
 * @property {import('appium-ios-tuntap').TunnelConnection} tunnelConnection
 * @property {(handler: (reason: string) => void) => void} registerOnDead
 * @property {import('appium-ios-remotexpc').AppleTVTunnelService} [tunnelService]
 */

/**
 * @typedef {EstablishedTunnel & { kind: 'usb', device: import('appium-ios-remotexpc').UsbmuxDevice, success: true }} UsbTunnelSuccess
 * @typedef {Object & { kind: 'usb', device: import('appium-ios-remotexpc').UsbmuxDevice, success: false, error: string }} UsbTunnelFailure
 * @typedef {UsbTunnelSuccess | UsbTunnelFailure} UsbTunnelResult
 */

/**
 * @typedef {EstablishedTunnel & { kind: 'appletv', device: { identifier: string, name?: string }, success: true, tunnelService: import('appium-ios-remotexpc').AppleTVTunnelService }} AppleTVTunnelSuccess
 * @typedef {Object & { kind: 'appletv', device: { identifier: string }, success: false, error: string }} AppleTVTunnelFailure
 * @typedef {AppleTVTunnelSuccess | AppleTVTunnelFailure} AppleTVTunnelResult
 */
