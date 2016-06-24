import log from './logger';
import { server as baseServer, routeConfiguringFunction } from 'appium-base-driver';
import { XCUITestDriver } from './driver';

async function startServer (port, host) {
  let d = new XCUITestDriver({port, host});
  let router = routeConfiguringFunction(d);
  let server = await baseServer(router, port, host);
  log.info(`XCUITestDriver server listening on http://${host}:${port}`);
  return server;
}

export { startServer };
