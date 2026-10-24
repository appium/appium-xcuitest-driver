---
title: watchOS Automation
---

The XCUITest driver supports automation of the watchOS platform. **Only the Simulator is
supported** - sessions requesting a real watchOS device will fail.

Sessions running on watchOS have the following minimum requirements:

* XCUITest driver 12.6.0 or later
* Xcode 15.4 or later
* watchOS 10 or later
* `appium-webdriveragent` **16.19.2 or newer** - upgrade the package to its latest release. Releases older
  than that carry no watchOS agent build at all, and several capabilities under
  [Known Limitations](#known-limitations) additionally need it

All watchOS sessions must set their `platformName` capability to `watchOS` (instead of `iOS`).

## Simulator Setup

Apart from installing the simulator itself, no additional configuration is needed - you can start a
session right away. Make sure to provide the simulator's `deviceName` and `platformVersion`:

```json
{
    "platformName": "watchOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": "<apple-watch-simulator-name>",
    "appium:platformVersion": "<watchos-version>",
    ...
}
```

## Applications

A watch application is installed and launched like any other: point `appium:app` at the `.app` bundle
(or an `.ipa` containing it) and the driver works out the bundle identifier. An application that ships
inside an iOS bundle is picked up too - the driver looks under the outer bundle's `Watch` folder and
reads the packaging keys Xcode writes (`WKCompanionAppBundleIdentifier`, `WKWatch1To1CompanionKey`, and
the standalone flags `WKWatchOnly`/`1KitProvisioningComponent`).

Where that finds more than one watch application, say which one to run with
`appium:watchBundleId`. It takes a bundle identifier, or a path to the watch bundle in any of the
forms the driver itself prints when it reports the ambiguity - relative to the outer bundle,
relative to its `Watch` folder, or the absolute path:

```json
{
    "platformName": "watchOS",
    "appium:automationName": "XCUITest",
    "appium:udid": "<apple-watch-simulator-udid>",
    "appium:app": "/path/to/MyIosApp.app",
    "appium:watchBundleId": "com.mycompany.myapp.watchkitapp"
}
```

Equivalent values for the same bundle: `MyIosApp.app/Watch/MyWatchApp.app`,
`Watch/MyWatchApp.app`, `MyWatchApp.app`.

A single discovered watch application is used without the capability. Several of them make the session
fail, and the error lists the identifiers and paths it found. Both `appium:watchBundleId` and
`appium:bundleId` name the application under test, so they are never applied to the packages listed in
`appium:otherApps`: such a package is resolved from its own contents and used as provided when it holds
exactly one watch application.

No Watch/iPhone Simulator pairing is needed: the watch application runs against the watch Simulator on
its own.

## Session Actions

watchOS apps are automated the same way as regular iOS/iPadOS apps - the standard
`findElement`/`click` methods and other native element interactions work as usual.

Hardware button presses are available through the [`mobile: pressButton`](../reference/execute-methods.md#mobile-pressbutton)
extension. watchOS only exposes the `home` button (and `action`, on models/OS versions that have a
hardware Action button).

Digital Crown rotation and hand gestures are available through the
[`mobile: rotateDigitalCrown`](../reference/execute-methods.md#mobile-rotatedigitalcrown) and
[`mobile: performHandGesture`](../reference/execute-methods.md#mobile-performhandgesture) extensions.

Element lookup works with `xpath`, `accessibility id`, `class name`, `-ios predicate string` and
`-ios class chain`. One caveat when porting selectors from an iOS suite: a class chain cannot match on
`identifier`, because WebDriverAgent's attribute list has `name` (which carries the accessibility
identifier) but no `identifier` - that is true on iOS too, so `**/XCUIElementTypeAny[\`identifier ==
"x"\`]` fails everywhere, and on a watch it is usually the first thing a ported selector trips over.
Match on `name` instead.

## Known Limitations

Verified against Apple Watch Series 11 (46mm) and Ultra 3 (49mm) Simulators on watchOS 26.5 with Xcode 26.6, plus
Series 12 (46mm) on watchOS 27.0 with Xcode 27.1 for the VoiceOver extensions below.

* Only the Simulator is supported; real watchOS devices cannot be used as automation targets
* Synthesized gestures need `appium-webdriveragent` **16.19.2 or newer** - upgrade the package to its
  latest release: the agent's event builders take UIKit's `UIInterfaceOrientation`, a type watchOS marks
  unavailable, so a watch build that does not work around it has the whole synthesis layer compiled out
  and only `POST /session/:id/element/:uuid/click` left, which every build serves. That family is
  [`mobile: tap`](../reference/execute-methods.md#mobile-tap),
  [`mobile: doubleTap`](../reference/execute-methods.md#mobile-doubletap),
  [`mobile: twoFingerTap`](../reference/execute-methods.md#mobile-twofingertap),
  [`mobile: touchAndHold`](../reference/execute-methods.md#mobile-touchandhold),
  [`mobile: scroll`](../reference/execute-methods.md#mobile-scroll),
  [`mobile: scrollToElement`](../reference/execute-methods.md#mobile-scrolltoelement),
  [`mobile: dragFromToForDuration`](../reference/execute-methods.md#mobile-dragfromtoforduration),
  [`mobile: dragFromToWithVelocity`](../reference/execute-methods.md#mobile-dragfromtowithvelocity),
  [`mobile: tapWithNumberOfTaps`](../reference/execute-methods.md#mobile-tapwithnumberoftaps) and standard
  W3C actions (`POST /session/:id/actions`). With an agent older than that floor each is rejected with a
  message naming the version to upgrade to, rather than the raw error such a build would have returned; on
  W3C actions that raw error is an unrecognized-selector 500, because the `/actions` route string *is*
  present in a build like that while the category answering it is not. Once the agent is new enough they
  all work - a W3C pointer sequence that taps an element makes that element's action fire
* [`mobile: swipe`](../reference/execute-methods.md#mobile-swipe) is supported, but its optional
  `velocity` argument is refused at any agent version. There, XCTest's velocity-carrying swipe stalls
  inside event synthesis - measured at 78 s before it took the WebDriverAgent runner down, which ends
  the session rather than just that command - so no build is ever asked to attempt one. The same
  gesture without `velocity` completes, and
  [`mobile: dragFromToForDuration`](../reference/execute-methods.md#mobile-dragfromtoforduration) is the
  fast coordinate-based alternative
* [`mobile: selectPickerWheelValue`](../reference/execute-methods.md#mobile-selectpickerwheelvalue) is
  unsupported at any agent version: the picker-wheel API behind it,
  `-adjustToPickerWheelValue:`, is declared for iOS only in the SDK, so the selector does not exist on
  watchOS. Scroll a list with [`mobile: swipe`](../reference/execute-methods.md#mobile-swipe), or turn
  the crown with [`mobile: rotateDigitalCrown`](../reference/execute-methods.md#mobile-rotatedigitalcrown)
* A velocity is refused by *swipes* only. [`mobile: dragFromToWithVelocity`](../reference/execute-methods.md#mobile-dragfromtowithvelocity)
  takes one and works, in both its forms: with `fromElementId` it reaches XCTest's
  `-pressForDuration:thenDragToElement:withVelocity:thenHoldForDuration:`, and with coordinates it goes
  through the agent's own event builder. Both were measured on watchOS 26.5 - the element form answers
  in about a second and leaves the agent serving
* Two-finger gestures are rejected: [`mobile: pinch`](../reference/execute-methods.md#mobile-pinch) and
  [`mobile: rotateElement`](../reference/execute-methods.md#mobile-rotateelement) are not registered by
  the watchOS WebDriverAgent build, and [`mobile: forcePress`](../reference/execute-methods.md#mobile-forcepress)
  has no hardware behind it because watches have no force sensor. The XCTest primitives behind them do
  run without error on watchOS 26.5, but no watch UI can show a pinch or a rotation, so they stay off
  until their effect is proven. Use
  [`mobile: touchAndHold`](../reference/execute-methods.md#mobile-touchandhold) for a long press and
  [`mobile: rotateDigitalCrown`](../reference/execute-methods.md#mobile-rotatedigitalcrown) to turn the crown
* Device orientation cannot be read or changed: `GET`/`POST /session/:id/orientation` is rejected. The
  watch Simulator has no notion of app or device orientation; rotate its window in the Simulator UI
  (`Device` > `Rotate Digital Crown`) if a different layout is needed
* Text entry works, but only through a narrow set of commands:

    * **W3C key actions are the recommended way to type**: `POST /session/:id/actions` with a `key` input
      source puts text in the focused field. Measured on watchOS 26.5, sending `gamma` followed by
      `Return` left the field showing `gammaok`
    * The on-screen keys can also be tapped. The `XCUIElementTypeKey` elements are present, `enabled` and
      `displayed`, and tapping one enters its character: the keyboard exposes 29 keys, one of them
      `delete`, each identifying itself by `label` (`Q`, `W`, `E`, `delete`, ...), and a
      `-ios predicate string` on either `label == 'Q'` or `name == 'Q'` matches exactly one of them.
      Resolve a key with a fresh lookup immediately before tapping it: a synthesised keystroke makes
      previously found key elements stale, so a list of keys found in advance taps once and then fails
      with `stale element reference`
    * `POST /session/:id/element/:uuid/value`, its bulk form `POST /session/:id/element/value` and the
      deprecated `POST /session/:id/keys` all answer `200` and enter nothing. Each one is served, but all
      of them land on the agent's own typing path, which is compiled out for watchOS - the agent says so in
      its log - so each is a silent no-op rather than an error; do not use any of them
    * `POST /session/:id/element/:uuid/clear` only empties a field that is focused and whose edit has been
      committed. On an unfocused field it answers `200` and does nothing
    * A SwiftUI `TextField` keeps its value uncommitted until the keyboard's `Done` button is tapped.
      [`mobile: hideKeyboard`](../reference/execute-methods.md#mobile-hidekeyboard) does that with
      `appium-webdriveragent` **16.19.2 or newer** - upgrade the package to its latest release. It asks the
      agent for both `done` and `Done`, because the control that closes the watch keyboard is the
      accessory bar's `Done` button rather than the iOS keyboard's `done` key, and that button is a
      sibling of `XCUIElementTypeKey` and `XCUIElementTypeKeyboard` in the element tree rather than a
      child of the keyboard, so the search has to leave the keyboard element. It must stay scoped to the
      text-input service that owns the accessory bar as well: `Done` is a common application button name,
      and an application-wide search can land on the app's own `Done` button and run its action
    * Tapping that button yourself works and is an alternative to
      [`mobile: hideKeyboard`](../reference/execute-methods.md#mobile-hidekeyboard): look for the app-wide
      button rather than a key inside the keyboard, for example with `-ios predicate string` on
      `name == 'Done' AND type == 'XCUIElementTypeButton'`
    * The named-key API stays out:
      [`mobile: keys`](../reference/execute-methods.md#mobile-keys) is rejected on watchOS, which has no
      XCUITest key-name API
* Alerts cannot be inspected or accepted: `GET /alert/text`, `GET /wda/alert/buttons`,
  `POST /session/:id/alert/accept` and `POST /session/:id/alert/dismiss` report "no such alert",
  and so do the driver helpers that wrap them. watchOS does not type an alert as
  `XCUIElementTypeAlert` - a SwiftUI `alert` renders inside the app's own tree as a table of cells
  with a button each - so there is no alert element for the agent to find. Drive an alert by looking
  up its buttons as ordinary elements and tapping them, for example
  `-ios predicate string` on `name == 'OK' AND type == 'XCUIElementTypeButton'`; that fires the
  alert's handler. [`appium:autoAcceptAlerts`](../reference/capabilities.md) and
  `appium:autoDismissAlerts` cannot work there either - the agent decides what to act on from the
  same detection - so on watchOS they are dropped at session start with a warning instead of being
  accepted and doing nothing. `appium-webdriveragent` **16.19.2 or newer** reports the absence honestly;
  a watchOS build whose alert detection instead matches the empty placeholder element the system
  application keeps in its tree at all times answers with an empty alert body or fires a failed alert
  action every two seconds, which is the behaviour the upgrade removes
* There is no clipboard or pasteboard access.
  [`mobile: setClipboard`](../reference/execute-methods.md#mobile-setclipboard)/
  [`mobile: getClipboard`](../reference/execute-methods.md#mobile-getclipboard) have no pasteboard
  endpoint in the watchOS build, and the watchOS Simulator runtime does not expose its pasteboard to
  the host either, so [`mobile: setPasteboard`](../reference/execute-methods.md#mobile-setpasteboard)/
  [`mobile: getPasteboard`](../reference/execute-methods.md#mobile-getpasteboard) are rejected too
* URLs cannot be opened: [`mobile: deepLink`](../reference/execute-methods.md#mobile-deeplink) and
  `POST /session/:id/url` are rejected, because the watch Simulator refuses both web and custom
  schemes with "Operation not supported"
* Text size and contrast cannot be read or changed:
  [`mobile: setContentSize`](../reference/execute-methods.md#mobile-setcontentsize) and
  [`mobile: setIncreaseContrast`](../reference/execute-methods.md#mobile-setincreasecontrast) are
  rejected, and the matching getters report `unsupported`
* [`mobile: getAppearance`](../reference/execute-methods.md#mobile-getappearance) always answers
  `unknown` on watchOS. Neither of the two sources the driver can ask knows the current style: the
  Simulator runtime reports `unsupported` for the watch appearance preference, and the agent's own
  `GET /wda/device/info` keeps answering `automatic` after the appearance has been changed.
  [`mobile: setAppearance`](../reference/execute-methods.md#mobile-setappearance) does apply the
  change - a screenshot taken before and after differs - by falling back to
  [`mobile: siriCommand`](../reference/execute-methods.md#mobile-siricommand), so confirm an
  appearance change with a screenshot rather than by reading it back
* [`mobile: batteryInfo`](../reference/execute-methods.md#mobile-batteryinfo) needs
  `appium-webdriveragent` **16.19.2 or newer** - upgrade the package to its latest release, whose watchOS
  build reads the battery through WatchKit. With an older agent the call is rejected with a message asking
  for the upgrade. A watch Simulator reports `level: -1` and `state: 0` (both unknown), because simulators
  have no battery.
* The VoiceOver extensions ([`mobile: enableVoiceOver`](../reference/execute-methods.md#mobile-enablevoiceover)
  and friends) need two things to line up, and each fails with its own message. The session's runtime
  must be watchOS 27 or newer - below that the driver's version check rejects the call and names
  `watchOS 27`, not an iOS number. The agent must also have been *built* against the watchOS 27 SDK:
  it reaches VoiceOver through an undocumented `-[XCUIDevice voiceOverService]`, and where that
  selector is absent the agent answers "The current OS runtime does not support VoiceOver control"
  even on a watchOS 27 Simulator - which is what the published watchOS agent archives do, because
  they are built against an older SDK for compatibility. With both satisfied, `enable`/`disable`
  round-trip through `mobile: isVoiceOverEnabled`, and
  [`mobile: voiceOverMove`](../reference/execute-methods.md#mobile-voiceovermove) alongside
  `voiceOverCurrentSpeech` return real utterances. Only `forward` and `backward` exist there;
  `in`/`out` are iOS-only and the agent names the supported set in the error

[`mobile: siriCommand`](../reference/execute-methods.md#mobile-siricommand),
[`mobile: listDisplays`](../reference/execute-methods.md#mobile-listdisplays) (which returns exactly
one entry, a watch having a single display) and
[`mobile: performAccessibilityAudit`](../reference/execute-methods.md#mobile-performaccessibilityaudit)
all work on watchOS, even though the endpoints behind them look iOS-specific.

The `appium:orientation` capability is accepted but **ignored with a warning** on watchOS: the app-level
orientation cannot be controlled there. The value is still handed to the Simulator as a window
orientation preference while the Simulator is started, so a session with that cap starts normally
instead of failing during startup.

Apart from the items above, the core surface works on watchOS: element lookup and other
`findElement` calls, source retrieval, screenshots, app lifecycle
(`mobile: launchApp`/`terminateApp`/`activateApp`/`queryAppState`),
[`mobile: pressButton`](../reference/execute-methods.md#mobile-pressbutton),
[`mobile: deviceScreenInfo`](../reference/execute-methods.md#mobile-devicescreeninfo),
[`mobile: activeAppInfo`](../reference/execute-methods.md#mobile-activeappinfo),
[`mobile: performIoHidEvent`](../reference/execute-methods.md#mobile-performiohidevent) and
XCTest screen recording (`mobile: startScreenRecording`/`stopScreenRecording`). Each entry in the
[execute methods reference](../reference/execute-methods.md) states its own watchOS behaviour where
that differs from iOS.

Rejected commands raise `NotImplementedError` naming the command, the platform and the reason, rather
than forwarding the request and surfacing a raw `unknown command` error from WebDriverAgent. Two cases
are settled before that decision is reached, because the command itself is supported on watchOS and only
part of it is not: a `mobile: swipe` `velocity` argument raises `InvalidArgumentError`, and a synthesized
gesture sent to an agent older than the **16.19.2** floor raises `NotImplementedError` naming the version
to upgrade to.

Argument validation happens before any of that. A malformed argument is malformed on every platform, so
`mobile: touchAndHold` with a non-numeric `duration`, or a W3C action whose origin is a web element, gets
the same `invalid argument` reply here that it gets on iOS rather than a message about watchOS.

## Related Tickets

* <https://github.com/appium/WebDriverAgent/pull/1209>
* <https://github.com/appium/WebDriverAgent/pull/1215>
* <https://github.com/appium/WebDriverAgent/pull/1216>
* <https://github.com/appium/WebDriverAgent/pull/1217>
* <https://github.com/appium/appium-xcuitest-driver/pull/2952>
