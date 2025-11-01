/**
 * Returns information about the active application.
 *
 * @returns {Promise<import('./types').ActiveAppInfo>} Active app information
 * @throws {Error} if an error raised by command
 * @this {import('../driver').XCUITestDriver}
 */
export async function mobileGetActiveAppInfo() {
  return /** @type {import('./types').ActiveAppInfo} */ (
    await this.proxyCommand('/wda/activeAppInfo', 'GET')
  );
}
