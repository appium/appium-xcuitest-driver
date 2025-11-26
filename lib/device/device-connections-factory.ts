import _ from 'lodash';
import net from 'net';
import B from 'bluebird';
import {logger, util, timing} from 'appium/support';
import {utilities} from 'appium-ios-device';
import {checkPortStatus} from 'portscanner';
import {waitForCondition} from 'asyncbox';
import type { AppiumLogger } from '@appium/types';

const LOCALHOST = '127.0.0.1';

class iProxy {
  private readonly localport: number;
  private readonly deviceport: number;
  private readonly udid: string;
  private localServer: net.Server | null;
  private readonly log: AppiumLogger;
  private onBeforeProcessExit: (() => void) | null;

  constructor(udid: string, localport: string | number, deviceport: string | number) {
    this.localport = parseInt(String(localport), 10);
    this.deviceport = parseInt(String(deviceport), 10);
    this.udid = udid;
    this.localServer = null;
    this.log = logger.getLogger(`iProxy@${udid.substring(0, 8)}:${this.localport}`);
    this.onBeforeProcessExit = null;
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

    this.onBeforeProcessExit = this._closeLocalServer.bind(this);
    // Make sure we free up the socket on process exit
    if (this.onBeforeProcessExit) {
      process.on('beforeExit', this.onBeforeProcessExit);
    }
  }

  stop(): void {
    if (this.onBeforeProcessExit) {
      process.off('beforeExit', this.onBeforeProcessExit);
      this.onBeforeProcessExit = null;
    }

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

const log = logger.getLogger('DevCon Factory');
const PORT_CLOSE_TIMEOUT = 15 * 1000; // 15 seconds
const SPLITTER = ':';

export class DeviceConnectionsFactory {
  private _connectionsMapping: ConnectionMapping;

  constructor() {
    this._connectionsMapping = {};
  }

  listConnections(
    udid: string | null = null,
    port: string | number | null = null,
    strict: boolean = false
  ): string[] {
    if (!udid && !port) {
      return [];
    }

    // `this._connectionMapping` keys have format `udid:port`
    // the `strict` argument enforces to match keys having both `udid` and `port`
    // if they are defined
    // while in non-strict mode keys having any of these are going to be matched
    return _.keys(this._connectionsMapping).filter((key) =>
      strict && udid && port
        ? key === this._toKey(udid, port)
        : (udid && key.startsWith(this._udidAsToken(udid))) ||
          (port && key.endsWith(this._portAsToken(port))),
    );
  }

  async requestConnection(
    udid?: string | null,
    port?: string | number | null,
    options: RequestConnectionOptions = {}
  ): Promise<void> {
    if (!udid || !port) {
      log.warn('Did not know how to request the connection:');
      if (!udid) {
        log.warn('- Device UDID is unset');
      }
      if (!port) {
        log.warn('- The local port number is unset');
      }
      return;
    }

    const {usePortForwarding, devicePort} = options;

    log.info(
      `Requesting connection for device ${udid} on local port ${port}` +
        (devicePort ? `, device port ${devicePort}` : ''),
    );
    log.debug(`Cached connections count: ${_.size(this._connectionsMapping)}`);
    const connectionsOnPort = this.listConnections(null, port);
    if (!_.isEmpty(connectionsOnPort)) {
      log.info(`Found cached connections on port #${port}: ${JSON.stringify(connectionsOnPort)}`);
    }

    if (usePortForwarding) {
      let isPortBusy = (await checkPortStatus(Number(port), LOCALHOST)) === 'open';
      if (isPortBusy) {
        log.warn(`Port #${port} is busy. Did you quit the previous driver session(s) properly?`);
        if (!_.isEmpty(connectionsOnPort)) {
          log.info('Trying to release the port');
          for (const key of this._releaseProxiedConnections(connectionsOnPort)) {
            delete this._connectionsMapping[key];
          }
          const timer = new timing.Timer().start();
          try {
            await waitForCondition(
              async () => {
                try {
                  if ((await checkPortStatus(Number(port), LOCALHOST)) !== 'open') {
                    log.info(
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
            log.warn(
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
    const currentKey = this._toKey(udid, port);
    if (usePortForwarding) {
      if (!_.isInteger(devicePort)) {
        throw new Error('devicePort is required when usePortForwarding is true');
      }
      const iproxy = new iProxy(udid, port, Number(devicePort));
      try {
        await iproxy.start();
        this._connectionsMapping[currentKey] = {iproxy};
      } catch (e) {
        try {
          iproxy.stop();
        } catch (e1) {
          log.debug(e1);
        }
        throw e;
      }
    } else {
      this._connectionsMapping[currentKey] = {};
    }
    log.info(`Successfully requested the connection for ${currentKey}`);
  }

  releaseConnection(udid: string | null = null, port: string | number | null = null): void {
    if (!udid && !port) {
      log.warn(
        'Neither device UDID nor local port is set. ' +
          'Did not know how to release the connection',
      );
      return;
    }
    log.info(`Releasing connections for ${udid || 'any'} device on ${port || 'any'} port number`);

    const keys = this.listConnections(udid, port, true);
    if (_.isEmpty(keys)) {
      log.info('No cached connections have been found');
      return;
    }
    log.info(`Found cached connections to release: ${JSON.stringify(keys)}`);
    this._releaseProxiedConnections(keys);
    for (const key of keys) {
      delete this._connectionsMapping[key];
    }
    log.debug(`Cached connections count: ${_.size(this._connectionsMapping)}`);
  }

  private _udidAsToken(udid?: string | null): string {
    return `${util.hasValue(udid) ? udid : ''}${SPLITTER}`;
  }

  private _portAsToken(port?: string | number | null): string {
    return `${SPLITTER}${util.hasValue(port) ? port : ''}`;
  }

  private _toKey(udid: string | null = null, port: string | number | null = null): string {
    return `${util.hasValue(udid) ? udid : ''}${SPLITTER}${util.hasValue(port) ? port : ''}`;
  }

  private _releaseProxiedConnections(connectionKeys: string[]): string[] {
    const keys = connectionKeys.filter((k) => _.has(this._connectionsMapping[k], 'iproxy'));
    for (const key of keys) {
      log.info(`Releasing the listener for '${key}'`);
      try {
        this._connectionsMapping[key].iproxy?.stop();
      } catch (e) {
        log.debug(e);
      }
    }
    return keys;
  }
}

export const DEVICE_CONNECTIONS_FACTORY = new DeviceConnectionsFactory();

interface ConnectionMapping {
  [key: string]: {
    iproxy?: iProxy;
  };
}

interface RequestConnectionOptions {
  usePortForwarding?: boolean;
  devicePort?: number | null;
}
