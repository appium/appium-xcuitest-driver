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

/**
 * Checks whether a value is a *web* element specifically, as opposed to a native one (type guard).
 *
 * A native element is wrapped exactly the same way a web element is - {@linkcode hasElementId}
 * can't tell the two apart by shape alone - so this also confirms the id is tracked in
 * `webElementsCache`, which is populated only by the atoms/web-execution machinery.
 *
 * @param webElementsCache - The driver's `webElementsCache`
 * @param element - Value to check
 * @returns True if the value is a web element tracked in `webElementsCache`
 */
export function hasWebElementId(webElementsCache: {has(key: string): boolean}, element: unknown): element is Element {
  return hasElementId(element) && webElementsCache.has(util.unwrapElement(element));
}
