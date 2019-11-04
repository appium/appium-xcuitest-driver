import _ from 'lodash';
import net from 'net';
import B from 'bluebird';
import { logger, util } from 'appium-support';
import { utilities } from 'appium-ios-device';
import { checkPortStatus } from 'portscanner';

class iProxy {
  constructor (udid, localport, deviceport) {
    this.localport = parseInt(localport, 10);
    this.deviceport = parseInt(deviceport, 10);
    this.udid = udid;
    this.serverSocket = null;
    this.log = logger.getLogger(`iProxy@${udid.substring(0, 8)}`);
  }

  async start () {
    if (this.serverSocket) {
      return;
    }
    this.serverSocket = net.createServer(async (connection) => {
      try {
        const socket = await utilities.connectPort(this.udid, this.deviceport);
        socket.on('close', () => connection.end());
        socket.on('error', (e) => this.log.error(e));
        connection.on('close', () => socket.end());
        connection.on('error', (e) => this.log.error(e));
        connection.pipe(socket);
        socket.pipe(connection);
      } catch (e) {
        this.log.error(e);
        connection.end();
      }
    });
    const status = new B((resolve, reject) => {
      this.serverSocket.once('listening', resolve);
      this.serverSocket.once('error', reject);
    });
    this.serverSocket.listen(this.localport);
    await status;
    this.serverSocket.on('error', (e) => this.log.error(e));
  }

  // eslint-disable-next-line require-await
  async quit () {
    if (!this.serverSocket) {
      return;
    }

    // TODO: Wait until the connection is actually closed
    // after the corresponding fixes are done in appium-ios-device
    // module. Without the fixes the close event might be delayed for up to
    // 30 seconds (see https://github.com/appium/appium-xcuitest-driver/pull/1094#issuecomment-546578765)
    this.serverSocket.once('close', () => {
      this.log.info('The connection has been closed');
      this.serverSocket = null;
    });
    this.serverSocket.close();
  }
}


const log = logger.getLogger('DevCon Factory');
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

  async _releaseProxiedConnections (connectionKeys) {
    const promises = [];
    for (const key of connectionKeys.filter((k) => _.has(this._connectionsMapping[k], 'iproxy'))) {
      promises.push((async () => {
        log.info(`Releasing the listener for '${key}'`);
        try {
          await this._connectionsMapping[key].iproxy.quit();
        } catch (ign) {}
        return key;
      })());
    }
    return await B.all(promises);
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
      let isPortBusy = (await checkPortStatus(port, '127.0.0.1')) === 'open';
      if (isPortBusy) {
        log.warn(`Port #${port} is busy`);
        if (!_.isEmpty(connectionsOnPort)) {
          log.info('Trying to release the port');
          for (const key of await this._releaseProxiedConnections(connectionsOnPort)) {
            delete this._connectionsMapping[key];
          }
          if ((await checkPortStatus(port, '127.0.0.1')) !== 'open') {
            log.info(`Port #${port} has been successfully released`);
            isPortBusy = false;
          } else {
            log.warn(`Did not know how to release port #${port}`);
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
          await iproxy.quit();
        } catch (ign) {}
        throw e;
      }
    } else {
      this._connectionsMapping[currentKey] = {};
    }
    log.info(`Successfully requested the connection for ${currentKey}`);
  }

  async releaseConnection (udid = null, port = null) {
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
    await this._releaseProxiedConnections(keys);
    for (const key of keys) {
      delete this._connectionsMapping[key];
    }
    log.debug(`Cached connections count: ${_.size(this._connectionsMapping)}`);
  }
}

const DEVICE_CONNECTIONS_FACTORY = new DeviceConnectionsFactory();

export { DEVICE_CONNECTIONS_FACTORY, DeviceConnectionsFactory };
export default DEVICE_CONNECTIONS_FACTORY;
