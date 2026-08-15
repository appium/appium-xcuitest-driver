import path from 'node:path';

import type {WebDriverAgent} from 'appium-webdriveragent';

import type {XCUITestDriver} from '../../driver.js';

/**
 * Returns the WebDriverAgent derived data root from Xcode build settings.
 */
export async function getDerivedDataPath(wda: WebDriverAgent): Promise<string | undefined> {
  const buildSettings = await wda.retrieveBuildSettings({
    scheme: 'WebDriverAgentRunner',
  });
  const buildDir = buildSettings?.BUILD_DIR;
  return buildDir ? path.dirname(path.dirname(path.normalize(buildDir))) : undefined;
}

/**
 * Gets the base URL for accessing WDA HTTP endpoints.
 *
 * @returns The base URL (e.g., 'http://127.0.0.1:8100')
 */
export function getWdaLocalhostRoot(this: XCUITestDriver): string {
  const wdaPort = () => {
    try {
      return this.wda.url?.port;
    } catch {
      // this.wda could raise an error when that was not initialized yet.
      return null;
    }
  };
  const remotePort =
    ((this.isRealDevice() ? this.opts.wdaRemotePort : null) ?? wdaPort() ?? this.opts.wdaLocalPort) || 8100;
  const remoteIp = this.opts.wdaBindingIP ?? '127.0.0.1';
  return `http://${remoteIp}:${remotePort}`;
}
