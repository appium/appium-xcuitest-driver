/* eslint-disable mocha/no-top-level-hooks */
import {startGuineaPigServer} from '../guinea-pig-server';

let closeServer: (() => Promise<void>) | undefined;
let serverPromise: ReturnType<typeof startGuineaPigServer> | undefined;

before(async function () {
  if (!serverPromise) {
    serverPromise = startServer();
  }
  await serverPromise;
});

after(async function () {
  await closeServer?.();
  closeServer = undefined;
  serverPromise = undefined;
});

async function startServer() {
  const server = await startGuineaPigServer();
  process.env.TEST_WEB_SERVER_BASE_URL = server.baseUrl;
  process.env.TEST_WEB_SERVER_HOST = server.host;
  process.env.TEST_WEB_SERVER_PORT = String(server.port);
  closeServer = server.close;
  return server;
}
