import type {Element} from '@appium/types';
import {util} from 'appium/support.js';

import {isPlainObject} from './lang.js';

/**
 * Checks whether a value looks like an atoms/W3C element wrapper (type guard).
 *
 * @param element - Value to check
 * @returns True if the value has an element ID
 */
export function hasElementId(element: unknown): element is Element {
  if (!isPlainObject(element)) {
    return false;
  }
  const unwrapped: unknown = util.unwrapElement(element as unknown as Element);
  return unwrapped !== element;
}
