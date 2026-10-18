import type {XCUITestDriver} from '../driver.js';
import type {ActiveAppInfo} from './types.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    mobileGetActiveAppInfo(
      ...args: Parameters<typeof mobileGetActiveAppInfo>
    ): ReturnType<typeof mobileGetActiveAppInfo>;
  }
}

/**
 * Returns information about the active application.
 *
 * @returns Active app information
 * @throws {Error} if an error raised by command
 */
export async function mobileGetActiveAppInfo(this: XCUITestDriver): Promise<ActiveAppInfo> {
  return await this.proxyCommand<unknown, ActiveAppInfo>('/wda/activeAppInfo', 'GET');
}
