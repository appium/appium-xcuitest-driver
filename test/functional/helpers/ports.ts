import net from 'node:net';

export async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      let port: number;
      if (address && typeof address === 'object' && 'port' in address) {
        port = address.port;
      } else {
        reject(new Error('Cannot determine any free port number'));
      }
      srv.close(() => resolve(port));
    });
  });
}
