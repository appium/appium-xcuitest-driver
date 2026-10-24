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
 * Lowest `appium-webdriveragent` version whose sources carry the watchOS agent. Everything gated
 * below ships in that one release, so the entries deliberately share this number rather than each
 * naming a version of its own: the intermediate versions this work passed through on the way here
 * (16.18.0, 16.19.0, 16.19.1) were never published, so no agent anyone can install reports them.
 *
 * The number is what the agent repository's package.json carries on the branch that introduces the
 * watch targets. Release tooling recomputes from it plus the commit types, so the version that
 * actually reaches npm will be this or higher - which still clears this floor. If that release ever
 * lands at a lower number than expected, or the work is split across releases, update this constant.
 */
const WATCHOS_CAPABLE_WDA_VERSION = '16.19.2';

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
    // watchOS reads the battery through WatchKit; see the `batteryInfo` route in WebDriverAgent's
    // FBCustomCommands, which only exists in the build that carries the watch targets.
    sinceWdaVersion: {[PLATFORM_NAME_WATCHOS]: WATCHOS_CAPABLE_WDA_VERSION},
    reason:
      'battery info needs a watchOS WebDriverAgent build that reads it through WatchKit, which ' +
      `versions older than ${WATCHOS_CAPABLE_WDA_VERSION} do not contain`,
    alternative:
      'upgrade the appium-webdriveragent package to its latest release, which is ' +
      `${WATCHOS_CAPABLE_WDA_VERSION} or newer`,
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
    // is absent from a watch agent that predates the watch targets: the event builders take a UIKit
    // `UIInterfaceOrientation`, a type watchOS marks unavailable, so the whole synthesis layer is
    // compiled out of such a build and only POST /element/:uuid/click remains. The build that adds
    // the watch targets collapses that enum to its raw portrait value, on a panel that never
    // rotates. W3C actions are the trickiest of the family: the `/actions` route string *is* present
    // in older watch builds, but the category answering it is not, so the request comes back as an
    // unrecognized-selector 500 rather than a clean 404.
    sinceWdaVersion: {[PLATFORM_NAME_WATCHOS]: WATCHOS_CAPABLE_WDA_VERSION},
    reason:
      'synthesized gestures need a watchOS WebDriverAgent build whose event builders no longer need ' +
      "UIKit's UIInterfaceOrientation, which " +
      `versions older than ${WATCHOS_CAPABLE_WDA_VERSION} do not contain`,
    alternative:
      'upgrade the appium-webdriveragent package to its latest release, which is ' +
      `${WATCHOS_CAPABLE_WDA_VERSION} or newer, ` +
      'or use POST /element/:uuid/click, which every watchOS build serves',
  },
  hideKeyboard: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // The control that closes the watch keyboard is the accessory bar's `Done` button, which
    // watchOS reports as a *sibling* of XCUIElementTypeKeyboard rather than a child of it. A search
    // confined to the keyboard element therefore finds nothing and reports 'Did not know how to
    // dismiss the keyboard', whatever key names the caller passes. Widening that search to the whole
    // application is not enough either: `Done` is a name watch apps use freely, so such a build can
    // tap the application's own control instead of the keyboard's. The build that adds the watch
    // targets only accepts matches owned by another process, which is where the keyboard's service
    // lives - measured on watchOS 26.5, where the accessory bar belongs to the text input process.
    sinceWdaVersion: {[PLATFORM_NAME_WATCHOS]: WATCHOS_CAPABLE_WDA_VERSION},
    reason:
      'keyboard dismissal needs a watchOS WebDriverAgent build whose search for the accessory ' +
      'bar is scoped to the keyboard-owning process, which ' +
      `versions older than ${WATCHOS_CAPABLE_WDA_VERSION} do not`,
    alternative:
      "upgrade the appium-webdriveragent package to its latest release, which is " +
      `${WATCHOS_CAPABLE_WDA_VERSION} or newer, ` +
      "or tap the 'Done' button of the keyboard's accessory bar directly",
  },
  keyboardInput: {
    unsupportedPlatforms: [PLATFORM_NAME_WATCHOS],
    // WebDriverAgent excludes the `keyboardInput` route from its watchOS build; the XCTest
    // XCUIKeyboardKey API behind it is unavailable there.
    reason:
      'the named-key keyboard endpoint is absent from the watchOS WebDriverAgent build, because ' +
      'watchOS has no XCUIKeyboardKey API',
    // Measured on watchOS 26.5. W3C key actions do land text, and tapping the keyboard's
    // XCUIElementTypeKey elements does too - a key answers `label` ('Q', 'W', 'delete'), and
    // re-resolving it by predicate before every tap is required because synthesising a keystroke
    // makes the cached element stale. Every other way of putting text in a field is a trap there:
    // POST /element/:id/value, its bulk form and the deprecated POST /session/:id/keys (which
    // reaches the agent's /wda/keys - that route *is* registered on watchOS) all answer 200 and
    // enter nothing, because the agent's typing path is compiled out for the platform. Pointing a
    // caller at one of those would report success for text that never appears.
    alternative:
      "use W3C key actions (POST /session/:id/actions with a 'key' input source), which do enter " +
      "text there, or tap the keyboard's XCUIElementTypeKey elements, resolving each by label " +
      'again before every tap because a key goes stale once a keystroke is synthesized',
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
  // `semver.coerce` alone would read a pre-release like `16.18.0-beta.4` as `16.18.0` and let it
  // through a `16.18.0` floor, even though that build ships *before* the release that adds the
  // routes. Parse properly so pre-releases rank below their own release, and only fall back to
  // coercion for strings that are not valid semver at all (for example a locally-built WDA that
  // reports a `v`-prefixed or otherwise non-semver build number, or none at all).
  const parsed = semver.parse(wdaVersion) ?? semver.coerce(wdaVersion);
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
