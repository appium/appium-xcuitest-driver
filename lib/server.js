import log from './logger';
import { server as baseServer } from 'appium-express';
import { routeConfiguringFunction } from 'mobile-json-wire-protocol';
import { WebDriverAgentDriver } from './driver';

async function startServer (port, host) {
  let d = new WebDriverAgentDriver({port, host});
  let router = routeConfiguringFunction(d);
  let server = baseServer(router, port, host);
  log.info(`WebDriverAgent server listening on http://${host}:${port}`);
  return server;
}

export { startServer };

