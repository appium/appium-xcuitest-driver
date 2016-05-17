import log from './logger';
import { server as baseServer, routeConfiguringFunction } from 'appium-base-driver';
import { WebDriverAgentDriver } from './driver';

async function startServer (port, host) {
  let d = new WebDriverAgentDriver({port, host});
  let router = routeConfiguringFunction(d);
  let server = await baseServer(router, port, host);
  log.info(`WebDriverAgent server listening on http://${host}:${port}`);
  return server;
}

export { startServer };
