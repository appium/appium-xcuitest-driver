import { main as startAppium } from 'appium';

async function startServer (port, address, relaxedSecurityEnabled = false) {
  // https://github.com/appium/appium/blob/2.0/packages/schema/lib/appium-config.schema.json
  return await startAppium({port, address, relaxedSecurityEnabled});
}

export { startServer };
