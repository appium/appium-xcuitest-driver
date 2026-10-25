---
title: iPhone Duo Automation
---

The XCUITest driver supports automation of the iPhone Duo simulator.

Duo sessions have the following minimum requirements:

* XCUITest driver 12.17.0 or later (WebDriverAgent 16.14.2 or later)
* Xcode 27.1 or later

Duo sessions use the standard iOS simulator setup with `platformName: iOS`.

## Session Actions

Duo apps are automated the same way as regular iOS/iPadOS apps - the standard
`findElement`/`click` methods and other native element interactions work as usual.

Available displays can be listed with
[`mobile: listDisplays`](../reference/execute-methods.md#mobile-listdisplays).
Use the [`currentDisplayId` setting](../reference/settings.md#currentdisplayid) to select the
display for screenshots, W3C actions, WDA MJPEG, and new XCTest recordings.
Folding does not update this setting: select the inner display when opening Duo and the outer
display when closing it. Restart XCTest recording to change its display.

The simulated hinge angle can be read and changed through the
[`mobile: getSimulatedHingeAngle`](../reference/execute-methods.md#mobile-getsimulatedhingeangle) and
[`mobile: setSimulatedHingeAngle`](../reference/execute-methods.md#mobile-setsimulatedhingeangle)
extensions. Simulator Home, volume up/down, lock/unlock, and hinge changes use the Mac-side
`@appium/coresim` HID service through `appium-ios-simulator`. Hinge readings remain
in WDA. Orientation and rotation commands use WDA on both simulators and
physical devices because WDA's internal animation-stability wait and orientation
verification are required. Physical devices use XCTest for button commands;
simulated hinge changes are unsupported.

## Known Limitations

* `mobile: setSimulatedHingeAngle` only supports simulators. `mobile: getSimulatedHingeAngle`
  supports both simulators and real devices with an available hinge sensor and CoreMotion readings.
* On Duo simulators, `mobile: pressButton` uses CoreSim for `home`, `volumeup`, and
  `volumedown`; other names are unsupported. `mobile: performIoHidEvent` forwards all
  valid HID page/usage values to CoreSim, including keyboard events. The runtime determines
  which events have an effect; successful submission alone does not confirm application.
* The WDA/XCTest IO HID route has reported failures on real Duo devices and also failed
  in Duo simulator tests with Xcode 27.1 / iOS 27.1. It may return success after timing out
  waiting for event completion. The simulator commands above use CoreSim to bypass this
  route.

## Related Tickets

* [Duo WDA startup support](https://github.com/appium/appium-xcuitest-driver/pull/3000)
* [Simulated hinge angle commands](https://github.com/appium/appium-xcuitest-driver/pull/3001)
* [WDA hinge angle support](https://github.com/appium/WebDriverAgent/pull/1287)
* [Duo simulator and real-device findings](https://github.com/appium/appium/issues/22857)
