import type {XCUITestDriver} from '../../driver';
import {cleanup} from './cleanup';

/**
 * Stops the active WebDriverAgent session, optionally quits the WDA process, and cleans up system files.
 */
export async function stop(this: XCUITestDriver): Promise<void> {
  try {
    if (!this._wda?.fullyStarted) {
      return;
    }

    if (this.wda.jwproxy) {
      try {
        await this.proxyCommand(`/session/${this.sessionId}`, 'DELETE');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.debug(`Unable to DELETE session on WDA: '${message}'. Continuing shutdown.`);
      }
    }

    // The former could cache the xcodebuild, so should not quit the process.
    // If the session skipped the xcodebuild (driver.wda.canSkipXcodebuild), the WDA instance
    // should quit properly.
    if ((!this.wda.webDriverAgentUrl && this.opts.useNewWDA) || this.wda.canSkipXcodebuild) {
      await this.wda.quit();
    }
  } finally {
    await cleanup(this);
  }
}
