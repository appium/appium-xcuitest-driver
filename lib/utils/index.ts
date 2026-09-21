import {util} from 'appium/support.js';

export const {escapeRegExp, isEmpty, isPlainObject, memoize, truncateString} = util;
export {assignDefaults, capitalize, mergeDeep, toErrorMessage, upperFirst} from './lang.js';
export {hasElementId, hasWebElementId} from './element.js';
export {cropBase64Image, requireSharp} from './image.js';
export {
  toApiLevelRequirementText,
  isTvOs,
  isWatchOs,
  normalizePlatformName,
  normalizePlatformVersion,
  supportsApiLevel17,
  supportsApiLevel18,
  supportsApiLevel27,
} from './platform.js';
