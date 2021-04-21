import { errors } from 'appium-base-driver';

const commands = {};

/**
 * @typedef {Object} HIDEventOptions
 * @property {!number|string} page The event page identifier
 * @property {!number|string} usage The event usage identifier (usages are defined per-page)
 * @property {!number|string} durationSeconds The event duration in float seconds
 * (XCTest uses 0.005 for a single press event)
 */

/**
 * Emulates triggering of the given low-level IO HID device event. The constants for possible events are defined
 * in https://unix.superglobalmegacorp.com/xnu/newsrc/iokit/IOKit/hidsystem/IOHIDUsageTables.h.html
 * Popular constants:
 * - kHIDPage_Consumer = 0x0C
 * - kHIDUsage_Csmr_VolumeIncrement  = 0xE9 (Volume Up)
 * - kHIDUsage_Csmr_VolumeDecrement  = 0xEA (Volume Down)
 * - kHIDUsage_Csmr_Menu = 0x40 (Home)
 * - kHIDUsage_Csmr_Power  = 0x30 (Power)
 * - kHIDUsage_Csmr_Snapshot  = 0x65 (Power + Home)
 *
 * @param {HIDEventOptions} opts
 */
commands.mobilePerformIoHidEvent = async function mobilePerformIoHidEvent (opts = {}) {
  const page = parseInt(opts.page, 10);
  if (Number.isNaN(page)) {
    throw new errors.InvalidArgumentError(`'page' argument must be a valid integer`);
  }
  const usage = parseInt(opts.usage, 10);
  if (Number.isNaN(usage)) {
    throw new errors.InvalidArgumentError(`'usage' argument must be a valid integer`);
  }
  const duration = parseFloat(opts.durationSeconds);
  if (Number.isNaN(duration)) {
    throw new errors.InvalidArgumentError(`'durationSeconds' argument must be a valid number`);
  }
  return await this.proxyCommand('/wda/performIoHidEvent', 'POST', { page, usage, duration });
};

export { commands };
export default commands;
