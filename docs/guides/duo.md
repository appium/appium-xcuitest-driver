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
display for screenshots and W3C touch actions.

The simulated hinge angle can be read and changed through the
[`mobile: getSimulatedHingeAngle`](../reference/execute-methods.md#mobile-getsimulatedhingeangle) and
[`mobile: setSimulatedHingeAngle`](../reference/execute-methods.md#mobile-setsimulatedhingeangle)
extensions.

## Known Limitations

* Duo automation has been verified only on the simulator. Feedback from real-device testing is
  welcome.

## Related Tickets

* [Duo WDA startup support](https://github.com/appium/appium-xcuitest-driver/pull/3000)
* [Simulated hinge angle commands](https://github.com/appium/appium-xcuitest-driver/pull/3001)
* [WDA hinge angle support and real-device feedback](https://github.com/appium/WebDriverAgent/pull/1287)
