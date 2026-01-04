import {errors} from 'appium/driver';
import {HIDUsageEvent, HIDPageEvent} from './hid-event';
import type {XCUITestDriver} from '../driver';

/**
 * Emulates triggering of the given low-level IO HID device event.
 *
 * Popular constants:
 * - `kHIDPage_Consumer` = `0x0C`
 * - `kHIDUsage_Csmr_VolumeIncrement` = `0xE9` (Volume Up)
 * - `kHIDUsage_Csmr_VolumeDecrement` = `0xEA` (Volume Down)
 * - `kHIDUsage_Csmr_Menu` = `0x40` (Home)
 * - `kHIDUsage_Csmr_Power` = `0x30` (Power)
 * - `kHIDUsage_Csmr_Snapshot` = `0x65` (Power + Home)
 *
 * @param page - The event page identifier
 * @param usage - The event usage identifier (usages are defined per-page)
 * @param durationSeconds - The event duration in float seconds (XCTest uses `0.005` for a single press event)
 */
export async function mobilePerformIoHidEvent(
  this: XCUITestDriver,
  page: HIDPageEvent,
  usage: number,
  durationSeconds: number | string,
): Promise<void> {
  if (!isHIDPageEvent(page)) {
    throw new errors.InvalidArgumentError(
      `'page' argument must be a valid HIDPageEvent identifier`,
    );
  }
  if (!isHIDUsageEvent(usage)) {
    throw new errors.InvalidArgumentError(`'usage' must be a valid HIDUsageEvent identifier`);
  }
  const duration = parseFloat(String(durationSeconds));
  if (Number.isNaN(duration)) {
    throw new errors.InvalidArgumentError(`'durationSeconds' argument must be a valid number`);
  }
  await this.proxyCommand('/wda/performIoHidEvent', 'POST', {page, usage, duration});
}

/**
 * Type guard for {@linkcode HIDUsageEvent}
 */
function isHIDUsageEvent(value: any): value is number {
  if (typeof value === 'string') {
    value = parseInt(value, 10);
  }
  if (Number.isNaN(value) || typeof value !== 'number') {
    return false;
  }
  return value in HIDUsageEvent;
}

/**
 * Type guard for {@linkcode HIDPageEvent}
 */
function isHIDPageEvent(value: any): value is HIDPageEvent {
  if (typeof value === 'string') {
    value = parseInt(value, 10);
  }
  if (Number.isNaN(value) || typeof value !== 'number') {
    return false;
  }
  return value in HIDPageEvent;
}

