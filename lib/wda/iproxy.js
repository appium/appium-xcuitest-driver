import { utilities } from 'appium-ios-device';
import net from 'net';

class iProxy {
  constructor (udid, localport, deviceport) {
    this.localport = parseInt(localport, 10);
    this.deviceport = parseInt(deviceport, 10);
    this.udid = udid;
  }

  start () {
    this.serverSocket = net.createServer(async (c) => {
      try {
        const socket = await utilities.connectPort(this.udid, this.deviceport);
        socket.on('close', c.destroy);
        c.on('close', socket.destroy);
        c.pipe(socket);
        socket.pipe(c);
      } catch (e) {
        c.destroy();
      }

    });
    this.serverSocket.listen(this.localport);
  }

  quit () {
    if (!this.serverSocket) {
      this.serverSocket.close();
    }
  }
}

export { iProxy };
export default iProxy;
