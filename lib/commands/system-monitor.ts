import {errors} from 'appium/driver.js';

import {SystemMonitorSession} from '../device/system-monitor-session.js';
import type {XCUITestDriver} from '../driver.js';
import {supportsApiLevel18} from '../utils/index.js';
import {requireRealDevice} from './helpers/index.js';

declare module '../driver.js' {
  interface XCUITestDriver {
    mobileStartSystemMonitor(
      ...args: Parameters<typeof mobileStartSystemMonitor>
    ): ReturnType<typeof mobileStartSystemMonitor>;
    mobileStopSystemMonitor(
      ...args: Parameters<typeof mobileStopSystemMonitor>
    ): ReturnType<typeof mobileStopSystemMonitor>;
  }
}

/**
 * Starts streaming DVT sysmontap (CPU / memory / per-process) samples to WebDriver BiDi subscribers
 * (`appium:xcuitest.systemMonitor`).
 *
 * Requires a real device on iOS/tvOS 18+ with a RemoteXPC tunnel.
 *
 * @see https://github.com/appium/appium-ios/tree/main/packages/remotexpc
 *
 * @param intervalMs - Optional sampling interval in milliseconds, forwarded to `sysmontap.configure()`.
 * Uses the sysmontap default (500ms) when omitted.
 *
 * If a monitor is already running, this is a no-op so the session keeps streaming.
 */
export async function mobileStartSystemMonitor(this: XCUITestDriver, intervalMs?: number): Promise<void> {
  requireRealDevice(this, 'DVT system monitor');

  if (!supportsApiLevel18(this.opts.platformVersion, this.opts.platformName)) {
    throw new errors.InvalidArgumentError(
      `mobile: startSystemMonitor requires iOS/tvOS 18 or newer. ` +
        `The current platformVersion is '${this.opts.platformVersion ?? 'unknown'}'.`,
    );
  }

  if (this._systemMonitorSession?.isRunning()) {
    this.log.info(`DVT system monitor is already active; continuing`);
    return;
  }
  if (this._systemMonitorSession) {
    this._systemMonitorSession = null;
  }

  const session = new SystemMonitorSession(this.log, this.device.udid, this.remoteXPCFacade);
  // Store before starting so concurrent starts and teardown can see and interrupt it
  this._systemMonitorSession = session;
  try {
    await session.start(this.eventEmitter, {intervalMs});
  } catch (e) {
    await session.interrupt();
    if (this._systemMonitorSession === session) {
      this._systemMonitorSession = null;
    }
    throw e;
  }
}

/** Stops DVT sysmontap streaming started with `mobile: startSystemMonitor`. */
export async function mobileStopSystemMonitor(this: XCUITestDriver): Promise<void> {
  if (!this._systemMonitorSession) {
    this.log.info('System monitor has not been started; nothing to stop');
    return;
  }
  await this._systemMonitorSession.interrupt();
  this._systemMonitorSession = null;
}
