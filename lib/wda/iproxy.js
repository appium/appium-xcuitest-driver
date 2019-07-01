import net from 'net';
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

  start () {
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
        connection.destroy();
      }
    });
    this.serverSocket.listen(this.localport);
  }

  quit () {
    if (this.serverSocket) {
      this.serverSocket.close();
      this.serverSocket = null;
    }
  }
}

export { iProxy };
export default iProxy;
