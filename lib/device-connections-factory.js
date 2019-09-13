import _ from 'lodash';
import net from 'net';
import B from 'bluebird';
import { logger } from 'appium-support';
import { utilities } from 'appium-ios-device';
import { checkPortStatus } from 'portscanner';

const log = logger.getLogger('iProxy');

class iProxy {
  constructor (udid, localport, deviceport) {
    this.localport = parseInt(localport, 10);
    this.deviceport = parseInt(deviceport, 10);
    this.udid = udid;
    this.serverSocket = null;
  }

  async start () {
    if (this.serverSocket) {
      return;
    }
    this.serverSocket = net.createServer(async (connection) => {
      try {
        const socket = await utilities.connectPort(this.udid, this.deviceport);
        socket.on('close', connection.destroy);
        socket.on('error', log.error);
        connection.on('close', socket.destroy);
        connection.on('error', log.error);
        connection.pipe(socket);
        socket.pipe(connection);
      } catch (e) {
        log.warn(e.message);
        connection.destroy();
      }
    });
    const status = new B((resolve, reject) => {
      this.serverSocket.once('listening', resolve);
      this.serverSocket.once('error', reject);
    });
    this.serverSocket.listen(this.localport);
    await status;
  }

  quit () {
    if (!this.serverSocket) {
      return;
    }
    this.serverSocket.close();
    this.serverSocket = null;
  }
}

class DeviceConnectionsFactory {
  constructor () {
    this._connectionsMapping = {};
  }

  _toKey (udid = null, port = null) {
    if (!udid && !port) {
      throw new Error('Either device udid or port must be set');
    }
    return `${udid || ''}:${port || ''}`;
  }

  listConnections (udid = null, port = null) {
    const expectedKey = this._toKey(udid, port);
    return _.toPairs(this._connectionsMapping)
      .map((pair) => pair[0])
      .filter((key) => key.startsWith(expectedKey) || key.endsWith(expectedKey));
  }

  async requestConnection (udid, port, options = {}) {
    const {
      usePortForwarding,
      devicePort,
    } = options;

    if (usePortForwarding) {
      let isPortBusy = (await checkPortStatus(port, '127.0.0.1')) === 'open';
      const activeConnections = this.listConnections(null, port);
      if (isPortBusy && !_.isEmpty(activeConnections)) {
        log.warn(`Port #${port} is busy. Trying to release it...`);
        const filterFunc = (k) => _.has(this._connectionsMapping[k], 'iproxy');
        for (const key of activeConnections.filter(filterFunc)) {
          log.info(`Releasing the listener for '${key}'`);
          this._connectionsMapping[key].iproxy.quit();
          delete this._connectionsMapping[key];
        }
        if ((await checkPortStatus(port, '127.0.0.1')) !== 'open') {
          log.info(`Port #${port} has been successfully released`);
          isPortBusy = false;
        } else {
          log.warn(`Did not know how to release port #${port}`);
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
        iproxy.quit();
        throw e;
      }
    } else {
      this._connectionsMapping[currentKey] = {};
    }
  }

  releaseConnection (udid = null, port = null) {
    const keys = this.listConnections(udid, port);
    try {
      keys
        .filter((k) => _.has(this._connectionsMapping[k], 'iproxy'))
        .map((k) => {
          try {
            this._connectionsMapping[k].quit();
          } catch (ign) {}
        });
    } finally {
      for (const key of keys) {
        delete this._connectionsMapping[key];
      }
    }
  }
}

const DEVICE_CONNECTIONS_FACTORY = new DeviceConnectionsFactory();

export { DEVICE_CONNECTIONS_FACTORY };
export default DEVICE_CONNECTIONS_FACTORY;
