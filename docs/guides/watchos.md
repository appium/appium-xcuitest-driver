---
title: watchOS Automation
---

The XCUITest driver supports automation of the watchOS platform. **Only the Simulator is
supported** - sessions requesting a real watchOS device will fail.

Sessions running on watchOS have the following minimum requirements:

* XCUITest driver 12.6.0 or later (WebDriverAgent 16.5.0 or later)
* Xcode 15.4 or later
* watchOS 10 or later

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

Verified against an Apple Watch Series 11 (46mm) Simulator on watchOS 26.5 with Xcode 26.6.

* Only the Simulator is supported; real watchOS devices cannot be used as automation targets
* [`mobile: swipe`](../reference/execute-methods.md#mobile-swipe) rejects a `velocity` argument. There
  XCTest's velocity-carrying swipe stalls inside event synthesis - measured at 78 s before it took the
  WebDriverAgent runner down, which ends the session rather than just that command - so the agent
  refuses the argument instead of attempting it. The same gesture without `velocity` completes, and
  `mobile: dragfromtoforduration` is the fast coordinate-based alternative. Standard W3C actions
  (`POST /session/:id/actions`) do work - a pointer sequence that taps an element makes that element's
  action fire
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
* Text entry works, but the keyboard only commits when told to: `POST /session/:id/element/:uuid/value`,
  `POST /session/:id/wda/keys` and W3C key actions all place text in the focused field, yet a SwiftUI
  `TextField` keeps its value uncommitted until the keyboard's `Done` button is tapped. Tapping
  the on-screen `XCUIElementTypeKey` elements works as well, and
  `DELETE /session/:id/element/:uuid/clear` empties a field. The named-key API is the exception:
  [`mobile: keys`](../reference/execute-methods.md#mobile-keys) is rejected because watchOS has no
  `XCUIKeyboardKey`.
  [`mobile: hideKeyboard`](../reference/execute-methods.md#mobile-hidekeyboard) does close the keyboard
  from WebDriverAgent 16.19.2 onwards; it asks the agent for both `done` and `Done`, because the
  control that closes the watch keyboard is the accessory bar's `Done` button rather than the iOS
  keyboard's `done` key, and older agents only looked inside the keyboard element and therefore never
  found it. 16.19.0 and 16.19.1 searched the whole application instead, which could land on an
  application's own `Done` button and run its action; 16.19.2 only taps matches belonging to the
  text-input service that owns the bar. That button is a sibling of `XCUIElementTypeKey` and
  `XCUIElementTypeKeyboard` in the element tree, so to tap it yourself, look for the app-wide button
  rather than a key inside the keyboard, for example with `-ios predicate string` on
  `name == 'Done' AND type == 'XCUIElementTypeButton'`
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
  accepted and doing nothing. From WebDriverAgent 16.19.1 the endpoints report the absence honestly:
  earlier watchOS builds matched an empty placeholder element that the system application keeps in
  its tree at all times, and answered with an empty alert body or fired a failed alert action every
  two seconds
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
* [`mobile: batteryInfo`](../reference/execute-methods.md#mobile-batteryinfo) needs a watchOS
  WebDriverAgent build of **16.18.0 or newer**, which is the first one that reads the battery through
  WatchKit. With an older agent the call is rejected with a message asking for the upgrade. A watch
  Simulator reports `level: -1` and `state: 0` (both unknown), because simulators have no battery.
* The VoiceOver extensions require watchOS 27 or later, which has no Simulator runtime to run them on
  yet, so they are rejected by the version check

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
than forwarding the request and surfacing a raw `unknown command` error from WebDriverAgent. The one
exception is a `mobile: swipe` `velocity` argument: the command itself is supported on watchOS and only
that argument is not, so the agent answers `invalid argument` (HTTP 400) with the reason instead of the
whole command being gated off.

## Related Tickets

* <https://github.com/appium/WebDriverAgent/pull/1209>
* <https://github.com/appium/WebDriverAgent/pull/1215>
* <https://github.com/appium/WebDriverAgent/pull/1216>
* <https://github.com/appium/WebDriverAgent/pull/1217>
* <https://github.com/appium/appium-xcuitest-driver/pull/2952>
