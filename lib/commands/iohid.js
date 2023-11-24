import {errors} from 'appium/driver';
import {HIDUsageEvent, HIDPageEvent} from './hid-event';

/**
 * Type guard for {@linkcode HIDUsageEvent}
 * @param {any} value
 * @returns {value is HIDUsageEvent}
 */
function isHIDUsageEvent(value) {
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
 * @param {any} value
 * @returns {value is HIDPageEvent}
 **/
function isHIDPageEvent(value) {
  if (typeof value === 'string') {
    value = parseInt(value, 10);
  }
  if (Number.isNaN(value) || typeof value !== 'number') {
    return false;
  }
  return value in HIDPageEvent;
}

export default {
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
   * @param {HIDPageEvent} page - The event page identifier
   * @param {HIDUsageEvent} usage - The event usage identifier (usages are defined per-page)
   * @param {number|string} durationSeconds - The event duration in float seconds (XCTest uses `0.005` for a single press event)
   * @this {import('../driver').XCUITestDriver}
   */
  async mobilePerformIoHidEvent(page, usage, durationSeconds) {
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
    return await this.proxyCommand('/wda/performIoHidEvent', 'POST', {page, usage, duration});
  },
};
