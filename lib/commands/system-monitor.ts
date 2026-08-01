import {SystemMonitorSession} from '../device/system-monitor-session.js';
import type {XCUITestDriver} from '../driver.js';
import {requireRealDevice} from './helpers/index.js';

/**
 * Starts streaming DVT sysmontap (CPU / memory / per-process) samples to WebDriver BiDi subscribers
 * (`appium:xcuitest.systemMonitor`).
 *
 * Requires a real device and appium-ios-remotexpc.
 *
 * @see https://github.com/appium/appium-ios-remotexpc
 *
 * @param intervalMs - Optional sampling interval in milliseconds, forwarded to `sysmontap.configure()`.
 * Uses the sysmontap default (500ms) when omitted.
 *
 * If a monitor is already running, this is a no-op so the session keeps streaming.
 */
export async function mobileStartSystemMonitor(this: XCUITestDriver, intervalMs?: number): Promise<void> {
  requireRealDevice(this, 'DVT system monitor');

  if (this._systemMonitorSession?.isRunning()) {
    this.log.info(`DVT system monitor is already active; continuing`);
    return;
  }
  if (this._systemMonitorSession) {
    this._systemMonitorSession = null;
  }

  const session = new SystemMonitorSession(this.log, this.device.udid, this.remoteXPCFacade);
  try {
    await session.start(this.eventEmitter, {intervalMs});
  } catch (e) {
    await session.interrupt();
    throw e;
  }
  this._systemMonitorSession = session;
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
