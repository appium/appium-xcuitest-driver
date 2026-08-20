export {
  assignDefaults,
  capitalize,
  escapeRegExp,
  isEmpty,
  isPlainObject,
  mergeDeep,
  toErrorMessage,
  truncateString,
  upperFirst,
} from './lang.js';
export {memoize} from './memoize.js';
export {
  isIos17OrNewer,
  isIos17OrNewerPlatform,
  isIos18OrNewer,
  isIos18OrNewerPlatform,
  isIos27OrNewer,
  isIos27OrNewerPlatform,
  isTvOs,
  isWatchOs,
  normalizePlatformName,
  normalizePlatformVersion,
} from './platform.js';
export type {PlatformVersionOpts} from './platform.js';
