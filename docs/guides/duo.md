---
title: iPhone Duo Automation
---

The XCUITest driver supports automation of the iPhone Duo. Both simulators and real devices are
supported.

Duo sessions have the following minimum requirements:

* XCUITest driver 12.17.0 or later (WebDriverAgent 16.14.2 or later)
* Xcode 27.1 or later

Duo sessions use the standard iOS setup with `platformName: iOS`.

## Session Actions

Duo apps are automated the same way as regular iOS/iPadOS apps - the standard
`findElement`/`click` methods and other native element interactions work as usual.

The hinge angle can be read and changed using the [`mobile: getSimulatedHingeAngle`](../reference/execute-methods.md#mobile-getsimulatedhingeangle)
and [`mobile: setSimulatedHingeAngle`](../reference/execute-methods.md#mobile-setsimulatedhingeangle)
execute methods. 

The driver does _not_ automatically switch the active display when changing the hinge angle, since
more than one display can be active at a time (e.g. when using the camera). The current display
must be explicitly changed:

* The [`mobile: listDisplays`](../reference/execute-methods.md#mobile-listdisplays) execute method
  can be used to retrieve all available displays
* The [`currentDisplayId`](../reference/settings.md#currentdisplayid) setting can be used to change
  the active display at any time. This setting affects screenshots, W3C actions, MJPEG streams, and
  new XCTest recordings. Any existing XCTest recordings must be restarted.

## Known Limitations

* `mobile: setSimulatedHingeAngle` only works on simulators, while `mobile: getSimulatedHingeAngle`
  works on both simulators and real devices
* `mobile: performIoHidEvent` has been reported not to work on real devices

## Related Tickets

* [Duo WDA startup support](https://github.com/appium/appium-xcuitest-driver/pull/3000)
* [Simulated hinge angle commands](https://github.com/appium/appium-xcuitest-driver/pull/3001)
* [WDA hinge angle support](https://github.com/appium/WebDriverAgent/pull/1287)
* [Duo simulator and real-device findings](https://github.com/appium/appium/issues/22857)
