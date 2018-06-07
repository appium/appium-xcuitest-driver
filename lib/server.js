import log from './logger';
import { server as baseServer, routeConfiguringFunction } from 'appium-base-driver';
import { XCUITestDriver } from './driver';

async function startServer (port, address) {
  let driver = new XCUITestDriver({port, address});
  let router = routeConfiguringFunction(driver);
  let server = await baseServer(router, port, address);
  // make the driver available
  server.driver = driver;
  log.info(`XCUITestDriver server listening on http://${address}:${port}`);
  return server;
}

export { startServer };
