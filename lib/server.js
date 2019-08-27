import log from './logger';
import { server as baseServer, routeConfiguringFunction } from 'appium-base-driver';
import { XCUITestDriver } from './driver';


async function startServer (port, address) {
  const driver = new XCUITestDriver({port, address});
  const server = await baseServer({
    routeConfiguringFunction: routeConfiguringFunction(driver),
    port,
    hostname: address,
    allowCors: false,
  });
  // make the driver available
  server.driver = driver;
  log.info(`XCUITestDriver server listening on http://${address}:${port}`);
  return server;
}

export { startServer };
