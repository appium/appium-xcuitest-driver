import net from 'net';
import B from 'bluebird';
import { logger } from 'appium-support';
import { utilities } from 'appium-ios-device';

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

export { iProxy };
export default iProxy;
