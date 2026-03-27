import _ from 'lodash';
import net from 'node:net';
import B from 'bluebird';
import {util, timing} from 'appium/support';
import {utilities} from 'appium-ios-device';
import {checkPortStatus} from 'portscanner';
import {waitForCondition} from 'asyncbox';
import type {AppiumLogger} from '@appium/types';
import type {DevicePortForwarder} from 'appium-ios-remotexpc';
import {isDeviceListedInUsbmux} from './usbmux-utils';

const LOCALHOST = '127.0.0.1';
const TERMINATION_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
const terminationCallbacks = new Set<() => void>();
const PORT_CLOSE_TIMEOUT = 15 * 1000; // 15 seconds
const SPLITTER = ':';

/**
 * Manages cached local device connections and optional TCP port forwarding to real iOS devices.
 *
 * Forwarding may use `appium-ios-remotexpc` on iOS 18+ (usbmux or tunnel) with fallback to
 * `appium-ios-device` {@linkcode utilities.connectPort}
 */
export class DeviceConnectionsFactory {
  /** Shared across factory instances so parallel sessions coordinate the same local ports. */
  private static _connectionsMapping: ConnectionMapping = {};

  /**
   * @param log - Logger for this factory
   */
  constructor(private readonly log: AppiumLogger) {}

  /**
   * Lists cache keys (`udid:localPort`) matching the given filters.
   *
   * @param udid - If set, only keys whose UDID prefix matches
   * @param port - If set, only keys whose local port suffix matches
   * @param strict - If true and both `udid` and `port` are set, only the exact `udid:port` key;
   *   otherwise keys matching either filter are included
   * @returns Matching connection keys (empty if both `udid` and `port` are omitted)
   */
  listConnections(
    udid: string | null = null,
    port: number | null = null,
    strict: boolean = false,
  ): string[] {
    if (!udid && !port) {
      return [];
    }

    // `this._connectionMapping` keys have format `udid:port`
    // the `strict` argument enforces to match keys having both `udid` and `port`
    // if they are defined
    // while in non-strict mode keys having any of these are going to be matched
    return _.keys(DeviceConnectionsFactory._connectionsMapping).filter((key) =>
      strict && udid && port
        ? key === this._toKey(udid, port)
        : (udid && key.startsWith(this._udidAsToken(udid))) ||
          (port && key.endsWith(this._portAsToken(port))),
    );
  }

  /**
   * Registers a connection for the device, optionally starting local TCP forwarding to `devicePort`.
   *
   * When `usePortForwarding` is true, ensures the local port is free (may release stale forwarders)
   * then starts forwarding. When false, only records an empty cache entry for the key.
   *
   * @param udid - Device UDID
   * @param port - Local port on the host
   * @param options - Forwarding options; `devicePort` and `platformVersion` are used when
   *   `usePortForwarding` is true (iOS 18+ may use RemoteXPC; otherwise legacy forwarding applies)
   * @throws If `usePortForwarding` is true but `devicePort` is not an integer
   * @throws If the local port is still in use after attempting cleanup
   */
  async requestConnection(
    udid?: string | null,
    port?: number | null,
    options: RequestConnectionOptions = {},
  ): Promise<void> {
    if (!udid || !port) {
      this._warnMissingRequestConnectionParams(udid, port);
      return;
    }

    const {usePortForwarding, devicePort, platformVersion} = options;

    this.log.info(
      `Requesting connection for device ${udid} on local port ${port}` +
        (devicePort ? `, device port ${devicePort}` : ''),
    );
    this.log.debug(
      `Cached connections count: ${_.size(DeviceConnectionsFactory._connectionsMapping)}`,
    );
    const connectionsOnPort = this.listConnections(null, port);
    if (!_.isEmpty(connectionsOnPort)) {
      this.log.info(
        `Found cached connections on port #${port}: ${JSON.stringify(connectionsOnPort)}`,
      );
    }

    if (usePortForwarding) {
      await this._ensureForwardingPortIsFree(port, connectionsOnPort);
    }

    const currentKey = this._toKey(udid, port);
    if (usePortForwarding) {
      if (!_.isInteger(devicePort)) {
        throw new Error('devicePort is required when usePortForwarding is true');
      }
      await this._startAndRegisterPortForwarder(
        currentKey,
        udid,
        port,
        Number(devicePort),
        platformVersion,
      );
    } else {
      DeviceConnectionsFactory._connectionsMapping[currentKey] = {};
    }
    this.log.info(`Successfully requested the connection for ${currentKey}`);
  }

  /**
   * Removes matching entries from the cache and stops any associated port forwarders.
   *
   * @param udid - If set, only connections for this device; use with `port` for a single exact key
   * @param port - If set, only connections on this local port
   */
  releaseConnection(udid: string | null = null, port: number | null = null): void {
    if (!udid && !port) {
      this.log.warn(
        'Neither device UDID nor local port is set. ' +
          'Did not know how to release the connection',
      );
      return;
    }
    this.log.info(
      `Releasing connections for ${udid || 'any'} device on ${port || 'any'} port number`,
    );

    const keys = this.listConnections(udid, port, true);
    if (_.isEmpty(keys)) {
      this.log.info('No cached connections have been found');
      return;
    }
    this.log.info(`Found cached connections to release: ${JSON.stringify(keys)}`);
    void this._releaseProxiedConnections(keys);
    for (const key of keys) {
      delete DeviceConnectionsFactory._connectionsMapping[key];
    }
    this.log.debug(
      `Cached connections count: ${_.size(DeviceConnectionsFactory._connectionsMapping)}`,
    );
  }

  private _warnMissingRequestConnectionParams(
    udid: string | null | undefined,
    port: number | null | undefined,
  ): void {
    this.log.warn('Did not know how to request the connection:');
    if (!udid) {
      this.log.warn('- Device UDID is unset');
    }
    if (!port) {
      this.log.warn('- The local port number is unset');
    }
  }

  private async _ensureForwardingPortIsFree(
    port: number,
    connectionsOnPort: string[],
  ): Promise<void> {
    let isPortBusy = (await checkPortStatus(port, LOCALHOST)) === 'open';
    if (isPortBusy) {
      this.log.warn(`Port #${port} is busy. Did you quit the previous driver session(s) properly?`);
      if (!_.isEmpty(connectionsOnPort)) {
        this.log.info('Trying to release the port');
        for (const key of await this._releaseProxiedConnections(connectionsOnPort)) {
          delete DeviceConnectionsFactory._connectionsMapping[key];
        }
        const timer = new timing.Timer().start();
        try {
          await waitForCondition(
            async () => {
              try {
                if ((await checkPortStatus(port, LOCALHOST)) !== 'open') {
                  this.log.info(
                    `Port #${port} has been successfully released after ` +
                      `${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
                  );
                  isPortBusy = false;
                  return true;
                }
              } catch {}
              return false;
            },
            {
              waitMs: PORT_CLOSE_TIMEOUT,
              intervalMs: 300,
            },
          );
        } catch {
          this.log.warn(
            `Did not know how to release port #${port} in ` +
              `${timer.getDuration().asMilliSeconds.toFixed(0)}ms`,
          );
        }
      }
    }

    if (isPortBusy) {
      throw new Error(
        `The port #${port} is occupied by an other process. ` +
          `You can either quit that process or select another free port.`,
      );
    }
  }

  private async _startAndRegisterPortForwarder(
    currentKey: string,
    udid: string,
    port: number,
    devicePort: number,
    platformVersion: string | null | undefined,
  ): Promise<void> {
    const portForwarder = await this._createPortForwarder(udid, port, devicePort, platformVersion);
    try {
      await portForwarder.start();
      DeviceConnectionsFactory._connectionsMapping[currentKey] = {portForwarder};
    } catch (e) {
      try {
        await portForwarder.stop();
      } catch (e1) {
        this.log.debug(e1);
      }
      throw e;
    }
  }

  private _udidAsToken(udid?: string | null): string {
    return `${util.hasValue(udid) ? udid : ''}${SPLITTER}`;
  }

  private _portAsToken(port?: number | null): string {
    return `${SPLITTER}${util.hasValue(port) ? port : ''}`;
  }

  private _toKey(udid: string | null = null, port: number | null = null): string {
    return `${util.hasValue(udid) ? udid : ''}${SPLITTER}${util.hasValue(port) ? port : ''}`;
  }

  private async _releaseProxiedConnections(connectionKeys: string[]): Promise<string[]> {
    const keys = connectionKeys.filter((k) =>
      _.has(DeviceConnectionsFactory._connectionsMapping[k], 'portForwarder'),
    );
    for (const key of keys) {
      this.log.info(`Releasing the listener for '${key}'`);
      try {
        await DeviceConnectionsFactory._connectionsMapping[key].portForwarder?.stop();
      } catch (e) {
        this.log.debug(e);
      }
    }
    return keys;
  }

  private async _createPortForwarder(
    udid: string,
    localPort: number,
    devicePort: number,
    platformVersion?: string | null,
  ): Promise<PortForwarder> {
    if (!platformVersion || !util.compareVersions(platformVersion, '>=', '18.0')) {
      this.log.debug(
        `Device '${udid}' is running iOS below 18 (platformVersion='${platformVersion ?? 'unknown'}'). ` +
          `Using appium-ios-device port forwarding fallback.`,
      );
      return new LegacyPortForwarder(udid, localPort, devicePort, this.log);
    }

    let remotexpc: RemotexpcModuleLike | null = null;
    try {
      remotexpc = (await import('appium-ios-remotexpc')) as RemotexpcModuleLike;
    } catch (err) {
      this.log.debug(
        `appium-ios-remotexpc is unavailable. Falling back to appium-ios-device port forwarding. ` +
          `Original error: ${(err as Error).message}`,
      );
    }
    if (!remotexpc) {
      return new LegacyPortForwarder(udid, localPort, devicePort, this.log);
    }

    const listedByUsbmux = await isDeviceListedInUsbmux(remotexpc, udid, this.log);
    if (listedByUsbmux) {
      this.log.debug(`Using appium-ios-remotexpc usbmux strategy for '${udid}'`);
      return new RemotexpcPortForwarder(
        new remotexpc.DevicePortForwarder(localPort, devicePort, {
          primaryConnector: () => remotexpc.connectViaUsbmux(udid, devicePort),
        }),
        this.log,
        localPort,
        devicePort,
      );
    }

    const {remoteXPC, tunnelConnection} = await remotexpc.Services.createRemoteXPCConnection(udid);
    const tunnelHost = tunnelConnection.host;
    // `remoteXPC` is only the RSD RemoteXPC session (handshake on tunnelConnection.port). The
    // forwarder opens its own TCP sockets via connectViaTunnel(tunnelHost, devicePort) per
    // client; it does not multiplex over this connection, so we close it to avoid leaking it.
    await remoteXPC.close().catch(() => {});
    this.log.debug(
      `Using appium-ios-remotexpc tunnel strategy for '${udid}' through '${tunnelHost}'`,
    );
    return new RemotexpcPortForwarder(
      new remotexpc.DevicePortForwarder(localPort, devicePort, {
        primaryConnector: () => remotexpc.connectViaTunnel(tunnelHost, devicePort),
      }),
      this.log,
      localPort,
      devicePort,
    );
  }
}

/** Holds a slot in the shared SIGINT/SIGTERM dispatch; {@link dispose} unregisters the callback. */
class TerminationSubscription {
  private unsubscribe: (() => void) | null = null;

  subscribe(onTerminate: () => void): void {
    this.dispose();
    this.unsubscribe = registerTerminationCallback(onTerminate);
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

class LegacyPortForwarder implements PortForwarder {
  private readonly localport: number;
  private readonly deviceport: number;
  private readonly udid: string;
  private localServer: net.Server | null;
  private readonly log: AppiumLogger;
  private readonly termination = new TerminationSubscription();

  constructor(udid: string, localport: number, deviceport: number, log: AppiumLogger) {
    this.localport = localport;
    this.deviceport = deviceport;
    this.udid = udid;
    this.localServer = null;
    this.log = log;
  }

  async start(): Promise<void> {
    if (this.localServer) {
      return;
    }

    this.localServer = net.createServer(async (localSocket: net.Socket) => {
      let remoteSocket: any;
      try {
        // We can only connect to the remote socket after the local socket connection succeeds
        remoteSocket = await utilities.connectPort(this.udid, this.deviceport);
      } catch (e) {
        this.log.debug((e as Error).message);
        localSocket.destroy();
        return;
      }

      const destroyCommChannel = () => {
        remoteSocket.unpipe(localSocket);
        localSocket.unpipe(remoteSocket);
      };
      remoteSocket.once('close', () => {
        destroyCommChannel();
        localSocket.destroy();
      });
      // not all remote socket errors are critical for the user
      remoteSocket.on('error', (e: Error) => this.log.debug(e));
      localSocket.once('end', destroyCommChannel);
      localSocket.once('close', () => {
        destroyCommChannel();
        remoteSocket.destroy();
      });
      localSocket.on('error', (e: Error) => this.log.warn(e.message));
      localSocket.pipe(remoteSocket);
      remoteSocket.pipe(localSocket);
    });
    const listeningPromise = new B<void>((resolve, reject) => {
      if (this.localServer) {
        this.localServer.once('listening', resolve);
        this.localServer.once('error', reject);
      } else {
        reject(new Error('Local server is not initialized'));
      }
    });
    this.localServer.listen(this.localport);
    try {
      await listeningPromise;
    } catch (e) {
      this.localServer = null;
      throw e;
    }
    this.localServer.on('error', (e: Error) => this.log.warn(e.message));
    this.localServer.once('close', (e?: Error) => {
      if (e) {
        this.log.info(`The connection has been closed with error ${e.message}`);
      } else {
        this.log.info(`The connection has been closed`);
      }
      this.localServer = null;
    });

    this.termination.subscribe(() => this._closeLocalServer());
  }

  async stop(): Promise<void> {
    this.termination.dispose();
    this._closeLocalServer();
  }

  private _closeLocalServer(): void {
    if (!this.localServer) {
      return;
    }

    this.log.debug(`Closing the connection`);
    this.localServer.close();
    this.localServer = null;
  }
}

class RemotexpcPortForwarder implements PortForwarder {
  private readonly onUpstreamConnectError: (err: unknown) => void;
  private readonly termination = new TerminationSubscription();

  constructor(
    private readonly forwarder: DevicePortForwarder,
    private readonly log: AppiumLogger,
    private readonly localPort: number,
    private readonly devicePort: number,
  ) {
    // DevicePortForwarder also emits `error` with the same payload; subscribe to one to avoid duplicates.
    this.onUpstreamConnectError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.debug(
        `RemoteXPC port forwarder upstream connect error (local ${this.localPort} -> device ${this.devicePort}): ${msg}`,
      );
    };
  }

  async start(): Promise<void> {
    this.forwarder.on('upstreamConnectError', this.onUpstreamConnectError);
    try {
      await this.forwarder.start();
    } catch (e) {
      this.forwarder.off('upstreamConnectError', this.onUpstreamConnectError);
      throw e;
    }

    this.termination.subscribe(() => this._scheduleEmergencyStop());
  }

  async stop(): Promise<void> {
    this.termination.dispose();
    this.forwarder.off('upstreamConnectError', this.onUpstreamConnectError);
    await this.forwarder.stop();
  }

  /** Best-effort stop when the process receives SIGINT/SIGTERM (errors are logged, not thrown). */
  private _scheduleEmergencyStop(): void {
    void (async () => {
      try {
        await this.forwarder.stop();
      } catch (err: unknown) {
        this.log.debug(err);
      }
    })();
  }
}

function dispatchProcessTermination(): void {
  for (const fn of [...terminationCallbacks]) {
    try {
      fn();
    } catch {
      // isolate callbacks so one failure does not skip the rest
    }
  }
}

/**
 * Registers a callback to run on SIGINT/SIGTERM. Uses one shared listener per signal for the
 * whole process; returns an unsubscribe that removes this callback from the dispatch set.
 */
function registerTerminationCallback(onTerminate: () => void): () => void {
  terminationCallbacks.add(onTerminate);
  if (terminationCallbacks.size === 1) {
    for (const sig of TERMINATION_SIGNALS) {
      process.on(sig, dispatchProcessTermination);
    }
  }
  return () => {
    terminationCallbacks.delete(onTerminate);
    if (terminationCallbacks.size === 0) {
      for (const sig of TERMINATION_SIGNALS) {
        process.off(sig, dispatchProcessTermination);
      }
    }
  };
}

interface ConnectionMapping {
  [key: string]: {
    portForwarder?: PortForwarder;
  };
}

/** Options for {@link DeviceConnectionsFactory.requestConnection}. */
interface RequestConnectionOptions {
  usePortForwarding?: boolean;
  devicePort?: number | null;
  platformVersion?: string | null;
}

/** Module shape for `await import('appium-ios-remotexpc')` (lazy load; optional at runtime). */
type RemotexpcModuleLike = typeof import('appium-ios-remotexpc');

interface PortForwarder {
  start(): Promise<void>;
  stop(): Promise<void>;
}
