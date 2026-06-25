import {errors} from 'appium/driver';
import {HIDUsageEvent, HIDPageEvent} from './hid-event';
import type {XCUITestDriver} from '../driver';
import {HidIndigoClient} from '../device/hid-indigo-client';
import {requireRealDevice} from './helpers';
import type {HidButtonName} from 'appium-ios-remotexpc';

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
 * Emulates triggering of the given low-level IO HID device event
 * via the HID Indigo RemoteXPC service.
 *
 * Requires **iOS/tvOS 26+**, real device, and a running RemoteXPC tunnel.
 *
 * @param name - The name of the button to press. Either this or `page` and `usage` must be provided.
 * @param page - The page of the button to press. Either this or `name` must be provided.
 * @param usage - The usage of the button to press. Either this or `name` must be provided.
 * @param durationSeconds - The duration of the button press in float seconds.
 * @param pressCount - The number of times to press the button.
 */
export async function mobilePerformIndigoHidEvent(
  this: XCUITestDriver,
  name?: HidButtonName,
  page?: number,
  usage?: number,
  durationSeconds?: number | string,
  pressCount?: number | string,
): Promise<void> {
  requireRealDevice(this, 'perform IO HID event with HID Indigo RemoteXPC service');

  if (name === undefined && (page === undefined || usage === undefined)) {
    throw new errors.InvalidArgumentError(`'name' or 'page' and 'usage' must be provided`);
  }

  const getDuration = () => {
    if (durationSeconds === undefined) {
      return undefined;
    }
    const duration = parseFloat(String(durationSeconds));
    if (Number.isNaN(duration)) {
      throw new errors.InvalidArgumentError(`'durationSeconds' argument must be a valid number`);
    }
    return duration;
  };

  const getPressCount = () => {
    if (pressCount === undefined) {
      return undefined;
    }
    const count = parseInt(String(pressCount), 10);
    if (Number.isNaN(count)) {
      throw new errors.InvalidArgumentError(`'pressCount' argument must be a valid number`);
    }
    return count;
  };

  const hidIndigoClient = new HidIndigoClient(this.device.udid, this.remoteXPCFacade);
  if (name) {
    await hidIndigoClient.pressButtonByName(name, {
      holdSeconds: getDuration(),
      pressCount: getPressCount(),
    });
  } else {
    await hidIndigoClient.pressButtonByPageAndUsage(page as number, usage as number, {
      holdSeconds: getDuration(),
      pressCount: getPressCount(),
    });
  }
}

/**
 * Type guard for {@linkcode HIDUsageEvent}
 */
function isHIDUsageEvent(value: any): value is keyof typeof HIDUsageEvent {
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
