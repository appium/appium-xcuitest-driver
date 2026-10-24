import {errors} from 'appium/driver.js';
import semver from 'semver';

import {PLATFORM_NAME_WATCHOS} from '../../constants.js';
import type {XCUITestDriver} from '../../driver.js';

/**
 * A named capability whose availability differs between the platforms this
 * driver supports.
 */
export type PlatformCapability =
  | 'alertHandling'
  | 'batteryInfo'
  | 'deepLink'
  | 'forceTouch'
  | 'gestureSynthesis'
  | 'hideKeyboard'
  | 'keyboardInput'
  | 'multiTouchGestures'
  | 'orientation'
  | 'pasteboardSimulator'
  | 'pasteboardWda'
  | 'pickerWheel'
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
  alertHandling: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // Neither the alert routes nor the alert monitor can work there: watchOS has no element typed
    // XCUIElementTypeAlert for them to act on. A SwiftUI alert renders inside its own app's tree as
    // a table of cells with a button each, which is reachable through ordinary element lookup but
    // is not an alert as far as the agent is concerned.
    reason:
      'watchOS never types an alert as XCUIElementTypeAlert, so there is no alert element for the ' +
      'agent to inspect or act on',
    alternative:
      "locate the alert's buttons as ordinary elements and tap them, for example with " +
      "'-ios predicate string' on \"name == 'OK' AND type == 'XCUIElementTypeButton'\"",
  },
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
  gestureSynthesis: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // Every synthesized gesture - tap, doubleTap, swipe, touchAndHold, scroll, drag and W3C actions -
    // is absent from a watchOS agent older than 16.18.0: the event builders take a UIKit
    // `UIInterfaceOrientation`, a type watchOS marks unavailable, so the whole synthesis layer was
    // compiled out of that build and only POST /element/:uuid/click remained. 16.18.0 collapses the
    // enum to its raw portrait value on a watch, whose panel never rotates. W3C actions are the
    // trickiest of the family: the `/actions` route string *is* present in older watch builds, but
    // the category answering it is not, so the request comes back as an unrecognized-selector 500.
    sinceWdaVersion: {[PLATFORM_NAME_WATCHOS]: '16.18.0'},
    reason:
      'synthesized gestures need a watchOS WebDriverAgent build whose event builders no longer need ' +
      "UIKit's UIInterfaceOrientation, which versions older than 16.18.0 do not contain",
    alternative:
      'upgrade WebDriverAgent to version 16.18.0 or newer, or use POST /element/:uuid/click, which ' +
      'every watchOS build serves',
  },
  hideKeyboard: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // The control that closes the watch keyboard is the accessory bar's `Done` button, which
    // watchOS reports as a *sibling* of XCUIElementTypeKeyboard. Agent builds up to 16.18.0 only
    // looked inside the keyboard element, so every dismissal there failed with 'Did not know how
    // to dismiss the keyboard', whatever key names were passed. 16.19.0 learned to search outside
    // it, but app-wide, and `Done` is a name watch apps use freely - such a build can tap the
    // application's own control instead of the keyboard's. 16.19.2 only accepts matches from
    // another process, which is where the keyboard's service lives.
    sinceWdaVersion: {[PLATFORM_NAME_WATCHOS]: '16.19.2'},
    reason:
      'keyboard dismissal needs a watchOS WebDriverAgent build whose search for the accessory ' +
      'bar is scoped to the keyboard-owning process, which versions older than 16.19.2 do not',
    alternative:
      "upgrade WebDriverAgent to version 16.19.2 or newer, or tap the 'Done' button of the " +
      "keyboard's accessory bar directly",
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
  pickerWheel: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // No agent version can gain this: XCUIElement's picker-wheel category, and with it
    // -adjustToPickerWheelValue:, is declared under `#if TARGET_OS_IOS` in the watchOS SDK headers,
    // so the selector does not exist there. The route stays out of the watch build for the same reason.
    reason:
      'watchOS has no picker-wheel API; the XCTest category behind it is compiled for iOS only, so ' +
      'no watchOS WebDriverAgent build can serve that endpoint',
    alternative: "use 'mobile: swipe' on the scrolling list, or 'mobile: rotateDigitalCrown'",
  },
  simulatorUiSettings: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // `simctl ui <watch> content_size|increase_contrast <value>` fails with 'Operation not
    // supported'; reading either setting answers 'unsupported'.
    reason:
      'the watchOS Simulator runtime refuses text-size and contrast changes; it reports both ' +
      'settings as unsupported',
  },
  // VoiceOver is deliberately absent: on watchOS 27 and newer the routes do work, so it is not a
  // platform limitation. Its own gate rejects watchOS below 27 with `watchOS 27.0` wording, and the
  // agent applies a second, independent check of its own - it reaches VoiceOver through an
  // undocumented selector that is only present when the agent was built against the watchOS 27 SDK.
  // Both conditions are measured; see docs/guides/watchos.md.
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
