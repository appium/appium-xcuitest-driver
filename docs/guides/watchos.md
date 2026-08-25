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

## Session Actions

watchOS apps are automated the same way as regular iOS/iPadOS apps - the standard
`findElement`/`click` methods and other native element interactions work as usual.

Hardware button presses are available through the [`mobile: pressButton`](../reference/execute-methods.md#mobile-pressbutton)
extension. watchOS only exposes the `home` button (and `action`, on models/OS versions that have a
hardware Action button).

Digital Crown rotation and hand gestures are available through the
[`mobile: rotateDigitalCrown`](../reference/execute-methods.md#mobile-rotatedigitalcrown) and
[`mobile: performHandGesture`](../reference/execute-methods.md#mobile-performhandgesture) extensions.

## Known Limitations

* Only the Simulator is supported; real watchOS devices cannot be used as automation targets
* Standard W3C gesture/touch actions (e.g. tap/swipe via the Actions API) do not work

## Related Tickets

* <https://github.com/appium/WebDriverAgent/pull/1209>
* <https://github.com/appium/WebDriverAgent/pull/1215>
* <https://github.com/appium/WebDriverAgent/pull/1216>
* <https://github.com/appium/WebDriverAgent/pull/1217>
* <https://github.com/appium/appium-xcuitest-driver/pull/2952>
