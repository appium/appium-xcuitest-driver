import net from 'node:net';
import _ from 'lodash';

/**
 *
 * @returns {Promise<number>}
 */
export async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      let port;
      if (_.has(address, 'port')) {
        port = /** @type {import('node:net').AddressInfo} */ (address).port;
      } else {
        reject(new Error('Cannot determine any free port number'));
      }
      srv.close(() => resolve(port));
    });
  });
}

