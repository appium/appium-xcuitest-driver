import {errors} from 'appium/driver';
import {NetworkMonitorSession} from '../device/network-monitor-session';
import {isIos18OrNewer, requireRealDevice} from '../utils';
import type {XCUITestDriver} from '../driver';

/**
 * Starts streaming DVT NetworkMonitor events to WebDriver BiDi subscribers (`appium:xcuitest.networkMonitor`).
 *
 * Requires a real device on iOS/tvOS 18+ and appium-ios-remotexpc.
 *
 * @see https://github.com/appium/appium-ios-remotexpc
 *
 * If a monitor is already running, this is a no-op so the session keeps streaming.
 */
export async function mobileStartNetworkMonitor(this: XCUITestDriver): Promise<void> {
  requireRealDevice(this, 'DVT network monitor');

  if (!isIos18OrNewer(this.opts)) {
    throw new errors.InvalidArgumentError(
      `mobile: startNetworkMonitor requires iOS/tvOS 18 or newer. ` +
        `The current platformVersion is '${this.opts.platformVersion ?? 'unknown'}'.`,
    );
  }

  if (this._networkMonitorSession?.isRunning()) {
    this.log.info(`DVT network monitor is already active; continuing`);
    return;
  }

  const session = new NetworkMonitorSession(this.log, this.device.udid);
  try {
    await session.start(this.eventEmitter);
  } catch (e) {
    await session.interrupt();
    throw e;
  }
  this._networkMonitorSession = session;
}

/** Stops DVT NetworkMonitor streaming started with `mobile: startNetworkMonitor`. */
export async function mobileStopNetworkMonitor(this: XCUITestDriver): Promise<void> {
  if (!this._networkMonitorSession) {
    this.log.info('Network monitor has not been started; nothing to stop');
    return;
  }
  await this._networkMonitorSession.interrupt();
  this._networkMonitorSession = null;
}
