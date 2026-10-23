import {errors} from 'appium/driver.js';
import semver from 'semver';

import {PLATFORM_NAME_WATCHOS} from '../../constants.js';
import type {XCUITestDriver} from '../../driver.js';

/**
 * A named capability whose availability differs between the platforms this
 * driver supports.
 */
export type PlatformCapability =
  | 'batteryInfo'
  | 'deepLink'
  | 'forceTouch'
  | 'keyboardInput'
  | 'multiTouchGestures'
  | 'orientation'
  | 'pasteboardSimulator'
  | 'pasteboardWda'
  | 'simulatorUiSettings';

interface PlatformSupportEntry {
  /**
   * Platforms whose WebDriverAgent build is known to omit the routes the
   * capability needs. iOS is the baseline of this driver, so it is never listed.
   */
  unsupportedPlatforms: string[];
  /**
   * Short explanation of the limitation, appended to the error message.
   */
  reason: string;
  /**
   * What to do instead, or `undefined` if there is no alternative. Must always
   * be something the user can actually do on the rejected platform.
   */
  alternative?: string;
  /**
   * Oldest WebDriverAgent package version whose build for the listed platform
   * contains the routes the capability needs. Where the connected agent reports
   * at least this version the capability is treated as supported, so the gate
   * never rejects a build that can actually serve the route.
   */
  sinceWdaVersion?: Partial<Record<string, string>>;
}

/**
 * Only lists capabilities that have been verified to be unavailable on a platform, either by
 * calling them against a live session or by reading the `#if` guards in
 * `packages/webdriveragent/WebDriverAgentLib`. A capability is listed when the request cannot
 * succeed there, which covers both routes a platform's WebDriverAgent build omits and routes the
 * platform's own runtime refuses - what matters to the caller is the clear error either way.
 * Entries that a later agent build gained carry `sinceWdaVersion`, so an up-to-date agent is not
 * rejected.
 *
 * tvOS is deliberately absent - its own limitations are documented in
 * `docs/guides/tvos.md` and are intentionally not gated here.
 */
const PLATFORM_SUPPORT: Readonly<Record<PlatformCapability, PlatformSupportEntry>> = {
  batteryInfo: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // watchOS reads the battery through WatchKit; see the `batteryInfo` route in
    // WebDriverAgent's FBCustomCommands, added in appium-webdriveragent 16.18.0.
    sinceWdaVersion: {[PLATFORM_NAME_WATCHOS]: '16.18.0'},
    reason:
      'battery info needs a watchOS WebDriverAgent build that reads it through WatchKit, ' +
      'which versions older than 16.18.0 do not contain',
    alternative: 'upgrade WebDriverAgent to version 16.18.0 or newer',
  },
  deepLink: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // Neither route can open a URL there: WebDriverAgent's `POST /url` answers 'Operation not
    // supported', and the Simulator-side `simctl openurl` the driver falls back to fails the same way.
    reason:
      'the watchOS Simulator cannot open URLs; its launch services reject both web and custom ' +
      'schemes with "Operation not supported"',
  },
  forceTouch: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    reason: 'watchOS displays have no force sensor',
    alternative: "use 'mobile: touchAndHold' for a long press",
  },
  keyboardInput: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // WebDriverAgent excludes the `keyboardInput` route from its watchOS build; the XCTest
    // XCUIKeyboardKey API behind it is unavailable there.
    reason:
      'the named-key keyboard endpoint is absent from the watchOS WebDriverAgent build, because ' +
      'watchOS has no XCUIKeyboardKey API',
    alternative:
      "use 'POST /element/:id/value', 'POST /wda/keys' or W3C key actions, which do enter text " +
      "there, or tap the keyboard's XCUIElementTypeKey elements",
  },
  multiTouchGestures: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    reason: 'watchOS devices have a single-touch display',
    alternative: "use 'mobile: swipe' or 'mobile: tap', or 'mobile: rotateDigitalCrown' to rotate the Digital Crown",
  },
  orientation: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    reason:
      'the watchOS Simulator does not support app or device orientation, so the orientation ' +
      'endpoint is absent from the watchOS WebDriverAgent build',
    alternative:
      "rotate the watch Simulator window in the Simulator UI ('Device > Rotate Digital Crown') " +
      'if a different layout is needed',
  },
  pasteboardSimulator: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // `simctl pbcopy`/`pbpaste` both answer 'Unable to connect to device pasteboard' on a watch
    // Simulator, so the driver-side pasteboard is unreachable as well.
    reason:
      'the watchOS Simulator runtime does not expose its pasteboard to the host; the connection ' +
      'the Simulator pasteboard commands rely on cannot be established',
  },
  pasteboardWda: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    reason:
      'the pasteboard endpoint is absent from the watchOS WebDriverAgent build, which has no ' +
      'UIPasteboard, and the Simulator-side pasteboard commands are unavailable there too',
  },
  simulatorUiSettings: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // `simctl ui <watch> content_size|increase_contrast <value>` fails with 'Operation not
    // supported'; reading either setting answers 'unsupported'.
    reason:
      'the watchOS Simulator runtime refuses text-size and contrast changes; it reports both ' +
      'settings as unsupported',
  },
  // VoiceOver is deliberately absent: its own version gate already rejects watchOS below 27 with
  // `watchOS 27.0` wording, and no watchOS 27 runtime exists to verify the endpoint against yet.
};

/**
 * Whether the given platform is expected to support the given capability.
 *
 * @param wdaVersion - `build.version` as reported by the connected WebDriverAgent, if known.
 * Capabilities that a platform only gained in a later agent build (see
 * `sinceWdaVersion`) count as supported once that build is in use.
 */
export function isPlatformSupported(
  capability: PlatformCapability,
  platformName?: string | null,
  wdaVersion?: string | null,
): boolean {
  const entry = PLATFORM_SUPPORT[capability];
  const actual = String(platformName ?? '').toUpperCase();
  const unsupported = entry.unsupportedPlatforms.some((candidate) => candidate.toUpperCase() === actual);
  if (!unsupported) {
    return true;
  }
  const since = minWdaVersionFor(capability, platformName);
  if (!since || !wdaVersion) {
    return false;
  }
  const parsed = semver.coerce(wdaVersion);
  return Boolean(parsed && semver.gte(parsed, since));
}

/**
 * The oldest WebDriverAgent package version whose build for `platformName`
 * contains the routes `capability` needs, or `undefined` if the capability is
 * never available there.
 */
export function minWdaVersionFor(capability: PlatformCapability, platformName?: string | null): string | undefined {
  const since = PLATFORM_SUPPORT[capability].sinceWdaVersion;
  if (!since) {
    return undefined;
  }
  const actual = String(platformName ?? '').toUpperCase();
  return Object.entries(since).find(([platform]) => platform.toUpperCase() === actual)?.[1];
}

/**
 * Builds the message used for capabilities the current platform does not
 * support. Kept separate from `requirePlatformSupport` so code that only warns
 * about a skipped capability can report the same reason.
 */
export function platformSupportMessage(
  capability: PlatformCapability,
  platformName: string | null | undefined,
  action: string,
): string {
  const {reason, alternative} = PLATFORM_SUPPORT[capability];
  return (
    `${action} is not supported on ${platformName ?? 'the current platform'}: ${reason}` +
    (alternative ? `; ${alternative}` : '')
  );
}

/**
 * Requires that the platform of the current session supports the given
 * capability, and throws a `NotImplementedError` otherwise.
 *
 * Use this for capabilities whose underlying WebDriverAgent route is not part
 * of the platform build; without it the user gets a raw `unknown command`
 * error out of WebDriverAgent instead of an explanation.
 */
export function requirePlatformSupport(driver: XCUITestDriver, capability: PlatformCapability, action: string): void {
  const platformName = driver.opts.platformName;
  if (isPlatformSupported(capability, platformName, driver.cachedWdaStatus?.build?.version)) {
    return;
  }
  throw new errors.NotImplementedError(platformSupportMessage(capability, platformName, action));
}
