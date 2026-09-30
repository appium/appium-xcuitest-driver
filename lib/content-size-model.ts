import {errors} from 'appium/driver.js';

import type {ContentSizeAction} from './commands/types.js';

/**
 * Dynamic Type sizes in ascending order.
 *
 * Single source of truth for both device types: the command layer validates against it, and
 * {@link CORE_DEVICE_SIZE_BY_CONTENT_SIZE} maps it onto the CoreDevice daemon's spelling for real
 * devices. Order is significant - `increment` / `decrement` step through this list.
 */
export const CONTENT_SIZES = [
  'extra-small',
  'small',
  'medium',
  'large',
  'extra-large',
  'extra-extra-large',
  'extra-extra-extra-large',
  'accessibility-medium',
  'accessibility-large',
  'accessibility-extra-large',
  'accessibility-extra-extra-large',
  'accessibility-extra-extra-extra-large',
] as const;

/** A Dynamic Type size, as opposed to one of the two step actions. */
export type ContentSize = (typeof CONTENT_SIZES)[number];

/** The two values that move relative to the current size rather than naming one. */
export const CONTENT_SIZE_STEPS = ['increment', 'decrement'] as const;

/** Every value `mobile: setContentSize` accepts. */
export const CONTENT_SIZE_ACTIONS = [...CONTENT_SIZES, ...CONTENT_SIZE_STEPS] as const;

/**
 * The driver's kebab-case sizes mapped onto the CoreDevice daemon's camelCase names.
 *
 * The five `accessibility-*` entries additionally need *Larger Accessibility Sizes* enabled on the
 * device; the daemon says so itself when it is off.
 *
 * @see https://github.com/appium/appium-ios-remotexpc/pull/338
 */
export const CORE_DEVICE_SIZE_BY_CONTENT_SIZE = {
  'extra-small': 'extraSmall',
  small: 'small',
  medium: 'medium',
  large: 'large',
  'extra-large': 'extraLarge',
  'extra-extra-large': 'extraExtraLarge',
  'extra-extra-extra-large': 'extraExtraExtraLarge',
  'accessibility-medium': 'accessibilityMedium',
  'accessibility-large': 'accessibilityLarge',
  'accessibility-extra-large': 'accessibilityExtraLarge',
  'accessibility-extra-extra-large': 'accessibilityExtraExtraLarge',
  'accessibility-extra-extra-extra-large': 'accessibilityExtraExtraExtraLarge',
} as const satisfies Record<ContentSize, string>;

/** The reverse of {@link CORE_DEVICE_SIZE_BY_CONTENT_SIZE}, for reading a size back. */
export const CONTENT_SIZE_BY_CORE_DEVICE_SIZE = Object.fromEntries(
  Object.entries(CORE_DEVICE_SIZE_BY_CONTENT_SIZE).map(([contentSize, coreDeviceSize]) => [
    coreDeviceSize,
    contentSize,
  ]),
) as Record<string, ContentSize | undefined>;

/**
 * Resolves `increment` / `decrement` against the size a device currently reports.
 *
 * Shared by both device types so they step identically. Stepping past either end returns the
 * current size unchanged, which callers can compare against to skip a pointless write.
 *
 * @throws {errors.InvalidArgumentError} If the current size is not a known Dynamic Type size,
 *         since there is no way to tell which way to step from it.
 */
export function stepContentSize(currentSize: string, direction: 'increment' | 'decrement'): ContentSize {
  const currentIndex = (CONTENT_SIZES as readonly string[]).indexOf(currentSize);
  if (currentIndex < 0) {
    throw new errors.InvalidArgumentError(
      `Cannot ${direction} the content size because the current value ('${currentSize}') is not one of ` +
        `${CONTENT_SIZES.join(', ')}. Set an explicit size first.`,
    );
  }
  const nextIndex = currentIndex + (direction === 'increment' ? 1 : -1);
  return CONTENT_SIZES[Math.min(Math.max(nextIndex, 0), CONTENT_SIZES.length - 1)];
}

/** Whether the given action names a step rather than a size. */
export function isContentSizeStep(action: ContentSizeAction): action is 'increment' | 'decrement' {
  return (CONTENT_SIZE_STEPS as readonly string[]).includes(action);
}
