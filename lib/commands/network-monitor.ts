import {errors} from 'appium/driver.js';

import {NetworkMonitorSession} from '../device/network-monitor-session.js';
import type {XCUITestDriver} from '../driver.js';
import {supportsApiLevel18} from '../utils/index.js';
import {requireRealDevice} from './helpers/index.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    mobileStartNetworkMonitor(
      ...args: Parameters<typeof mobileStartNetworkMonitor>
    ): ReturnType<typeof mobileStartNetworkMonitor>;
    mobileStopNetworkMonitor(
      ...args: Parameters<typeof mobileStopNetworkMonitor>
    ): ReturnType<typeof mobileStopNetworkMonitor>;
  }
}

/**
 * Starts streaming DVT NetworkMonitor events to WebDriver BiDi subscribers (`appium:xcuitest.networkMonitor`).
 *
 * Requires a real device on iOS/tvOS 18+ with a RemoteXPC tunnel.
 *
 * @see https://github.com/appium/appium-ios/tree/main/packages/remotexpc
 *
 * If a monitor is already running, this is a no-op so the session keeps streaming.
 */
export async function mobileStartNetworkMonitor(this: XCUITestDriver): Promise<void> {
  requireRealDevice(this, 'DVT network monitor');

  if (!supportsApiLevel18(this.opts.platformVersion, this.opts.platformName)) {
    throw new errors.InvalidArgumentError(
      `mobile: startNetworkMonitor requires iOS/tvOS 18 or newer. ` +
        `The current platformVersion is '${this.opts.platformVersion ?? 'unknown'}'.`,
    );
  }

  const existing = this._networkMonitorSession;
  if (existing?.isRunning()) {
    this.log.info(`DVT network monitor is already active; continuing`);
    // Waits for an in-flight start and shares its outcome; no-op once streaming
    await existing.start(this.eventEmitter);
    return;
  }
  if (this._networkMonitorSession) {
    this._networkMonitorSession = null;
  }

  const session = new NetworkMonitorSession(this.log, this.device.udid, this.remoteXPCFacade);
  // Store before starting so concurrent starts and teardown can see and interrupt it
  this._networkMonitorSession = session;
  try {
    await session.start(this.eventEmitter);
  } catch (e) {
    await session.interrupt();
    if (this._networkMonitorSession === session) {
      this._networkMonitorSession = null;
    }
    throw e;
  }
}

/** Stops DVT NetworkMonitor streaming started with `mobile: startNetworkMonitor`. */
export async function mobileStopNetworkMonitor(this: XCUITestDriver): Promise<void> {
  const session = this._networkMonitorSession;
  if (!session) {
    this.log.info('Network monitor has not been started; nothing to stop');
    return;
  }
  await session.interrupt();
  // A newer session may have been registered while this one was closing
  if (this._networkMonitorSession === session) {
    this._networkMonitorSession = null;
  }
}
