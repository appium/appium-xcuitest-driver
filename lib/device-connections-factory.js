import _ from 'lodash';
import net from 'net';
import B from 'bluebird';
import { logger, util, timing } from 'appium-support';
import { utilities } from 'appium-ios-device';
import { checkPortStatus } from 'portscanner';
import { waitForCondition } from 'asyncbox';


const LOCALHOST = '127.0.0.1';

class iProxy {
  constructor (udid, localport, deviceport) {
    this.localport = parseInt(localport, 10);
    this.deviceport = parseInt(deviceport, 10);
    this.udid = udid;
    this.localServer = null;
    this.log = logger.getLogger(`iProxy@${udid.substring(0, 8)}:${this.localport}`);
  }

  async start () {
    if (this.localServer) {
      return;
    }

    this.localServer = net.createServer(async (localSocket) => {
      let remoteSocket;
      try {
        // We can only connect to the remote socket after the local socket connection succeeds
        remoteSocket = await utilities.connectPort(this.udid, this.deviceport);
      } catch (e) {
        this.log.debug(e.message);
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
      remoteSocket.on('error', (e) => this.log.debug(e));
      localSocket.once('end', destroyCommChannel);
      localSocket.once('close', () => {
        destroyCommChannel();
        remoteSocket.destroy();
      });
      localSocket.on('error', (e) => this.log.warn(e.message));
      localSocket.pipe(remoteSocket);
      remoteSocket.pipe(localSocket);
    });
    const listeningPromise = new B((resolve, reject) => {
      this.localServer.once('listening', resolve);
      this.localServer.once('error', reject);
    });
    this.localServer.listen(this.localport);
    try {
      await listeningPromise;
    } catch (e) {
      this.localServer = null;
      throw e;
    }
    this.localServer.on('error', (e) => this.log.warn(e.message));
    this.localServer.once('close', (e) => {
      if (e) {
        this.log.info(`The connection has been closed with error ${e.message}`);
      } else {
        this.log.info(`The connection has been closed`);
      }
      this.localServer = null;
    });

    this.onBeforeProcessExit = this._closeLocalServer.bind(this);
    // Make sure we free up the socket on process exit
    process.on('beforeExit', this.onBeforeProcessExit);
  }

  _closeLocalServer () {
    if (!this.localServer) {
      return;
    }

    this.log.debug(`Closing the connection`);
    this.localServer.close();
    this.localServer = null;
  }

  stop () {
    if (this.onBeforeProcessExit) {
      process.off('beforeExit', this.onBeforeProcessExit);
      this.onBeforeProcessExit = null;
    }

    this._closeLocalServer();
  }
}


const log = logger.getLogger('DevCon Factory');
const PORT_CLOSE_TIMEOUT = 15 * 1000; // 15 seconds
const SPLITTER = ':';

class DeviceConnectionsFactory {
  constructor () {
    this._connectionsMapping = {};
  }

  _udidAsToken (udid) {
    return `${util.hasValue(udid) ? udid : ''}${SPLITTER}`;
  }

  _portAsToken (port) {
    return `${SPLITTER}${util.hasValue(port) ? port : ''}`;
  }

  _toKey (udid = null, port = null) {
    return `${util.hasValue(udid) ? udid : ''}${SPLITTER}${util.hasValue(port) ? port : ''}`;
  }

  _releaseProxiedConnections (connectionKeys) {
    const keys = connectionKeys
      .filter((k) => _.has(this._connectionsMapping[k], 'iproxy'));
    for (const key of keys) {
      log.info(`Releasing the listener for '${key}'`);
      try {
        this._connectionsMapping[key].iproxy.stop();
      } catch (e) {
        log.debug(e);
      }
    }
    return keys;
  }

  listConnections (udid = null, port = null, strict = false) {
    if (!udid && !port) {
      return [];
    }

    // `this._connectionMapping` keys have format `udid:port`
    // the `strict` argument enforces to match keys having both `udid` and `port`
    // if they are defined
    // while in non-strict mode keys having any of these are going to be matched
    return _.keys(this._connectionsMapping)
      .filter((key) => (strict && udid && port)
        ? (key === this._toKey(udid, port))
        : (udid && key.startsWith(this._udidAsToken(udid)) || port && key.endsWith(this._portAsToken(port)))
      );
  }

  async requestConnection (udid, port, options = {}) {
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

    const {
      usePortForwarding,
      devicePort,
    } = options;

    log.info(`Requesting connection for device ${udid} on local port ${port}` +
      (devicePort ? `, device port ${devicePort}` : ''));
    log.debug(`Cached connections count: ${_.size(this._connectionsMapping)}`);
    const connectionsOnPort = this.listConnections(null, port);
    if (!_.isEmpty(connectionsOnPort)) {
      log.info(`Found cached connections on port #${port}: ${JSON.stringify(connectionsOnPort)}`);
    }

    if (usePortForwarding) {
      let isPortBusy = (await checkPortStatus(port, LOCALHOST)) === 'open';
      if (isPortBusy) {
        log.warn(`Port #${port} is busy. Did you quit the previous driver session(s) properly?`);
        if (!_.isEmpty(connectionsOnPort)) {
          log.info('Trying to release the port');
          for (const key of this._releaseProxiedConnections(connectionsOnPort)) {
            delete this._connectionsMapping[key];
          }
          const timer = new timing.Timer().start();
          try {
            await waitForCondition(async () => {
              try {
                if ((await checkPortStatus(port, LOCALHOST)) !== 'open') {
                  log.info(`Port #${port} has been successfully released after ` +
                    `${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
                  isPortBusy = false;
                  return true;
                }
              } catch (ign) {}
              return false;
            }, {
              waitMs: PORT_CLOSE_TIMEOUT,
              intervalMs: 300,
            });
          } catch (ign) {
            log.warn(`Did not know how to release port #${port} in ` +
              `${timer.getDuration().asMilliSeconds.toFixed(0)}ms`);
          }
        }
      }

      if (isPortBusy) {
        throw new Error(`The port #${port} is occupied by an other process. ` +
          `You can either quit that process or select another free port.`);
      }
    }
    const currentKey = this._toKey(udid, port);
    if (usePortForwarding) {
      const iproxy = new iProxy(udid, port, devicePort);
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

  releaseConnection (udid = null, port = null) {
    if (!udid && !port) {
      log.warn('Neither device UDID nor local port is set. ' +
        'Did not know how to release the connection');
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
}

const DEVICE_CONNECTIONS_FACTORY = new DeviceConnectionsFactory();

export { DEVICE_CONNECTIONS_FACTORY, DeviceConnectionsFactory };
export default DEVICE_CONNECTIONS_FACTORY;
